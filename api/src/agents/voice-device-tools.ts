import {
  DEVICE_CALL_ID_MAX_LENGTH,
  DeviceActionSchema,
  type DeviceAction,
  type DeviceInfo,
  type VoiceToolResult,
} from '@mylife/shared';
import { randomUUID } from 'node:crypto';
import { APIError } from 'groq-sdk';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from 'groq-sdk/resources/chat/completions';
import { z } from 'zod';
import type { DeviceToolDefinition } from '../tools/types.js';

/** Device tools in the shape the Chat Completions API expects. */
export function toModelTools(tools: readonly DeviceToolDefinition[]): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export type DeviceToolCallOutcome =
  /** Valid call: send this action to the phone. */
  | { kind: 'action'; action: DeviceAction }
  /** The model called an offered tool with bad arguments: ask the user instead. */
  | { kind: 'invalid'; tool: DeviceToolDefinition; callId: string }
  /** Valid call, but server code decided to speak first (e.g. confirm the closest alarm). */
  | { kind: 'reply'; tool: DeviceToolDefinition; callId: string; reply: string }
  /** No call to an offered tool (plain text reply, or a tool we never offered). */
  | { kind: 'none'; ignoredToolNames: string[] };

function parseJson(text: string): unknown {
  // Tools without arguments may come back with an empty string instead of "{}".
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Groq IDs are short, but the phone only accepts bounded non-empty IDs. */
function usableCallId(id: string): string {
  return id.length > 0 && id.length <= DEVICE_CALL_ID_MAX_LENGTH ? id : `call_${randomUUID()}`;
}

/**
 * Picks the first call to an offered device tool, validates the model's
 * arguments (rule 4: model output is untrusted), lets the tool resolve them
 * deterministically (e.g. match a known alarm), and validates the final action
 * with the shared schema. Only one action per turn: further calls are ignored.
 */
export function pickDeviceToolCall(
  toolCalls: readonly ChatCompletionMessageToolCall[] | undefined,
  offered: readonly DeviceToolDefinition[],
  device?: DeviceInfo,
  userText?: string,
): DeviceToolCallOutcome {
  const calls = toolCalls ?? [];
  for (const call of calls) {
    const tool = offered.find((candidate) => candidate.name === call.function.name);
    if (!tool) continue;

    const callId = usableCallId(call.id);
    const modelArgs = (tool.modelInput ?? tool.input).safeParse(parseJson(call.function.arguments));
    if (!modelArgs.success) return { kind: 'invalid', tool, callId };

    const resolution = tool.resolve
      ? tool.resolve(modelArgs.data, { device, ...(userText === undefined ? {} : { userText }) })
      : { kind: 'action' as const, args: modelArgs.data };
    if (resolution.kind === 'reply') return { kind: 'reply', tool, callId, reply: resolution.reply };

    const parsed = DeviceActionSchema.safeParse({ callId, name: tool.name, args: resolution.args });
    if (!parsed.success) return { kind: 'invalid', tool, callId };
    return { kind: 'action', action: parsed.data };
  }
  return { kind: 'none', ignoredToolNames: calls.map((call) => call.function.name) };
}

/**
 * Replays the device round trip for the continuation turn: the assistant's
 * tool call, then the phone's result as a `tool` message. The result is
 * schema-validated data, never instructions.
 */
export function toolResultMessages(toolResult: VoiceToolResult): ChatCompletionMessageParam[] {
  return [
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: toolResult.callId,
          type: 'function',
          function: { name: toolResult.name, arguments: JSON.stringify(toolResult.args) },
        },
      ],
    },
    // groq-sdk's tool message type has no `name` field; `tool_call_id` links it to the call.
    { role: 'tool', tool_call_id: toolResult.callId, content: JSON.stringify(toolResult.result) },
  ];
}

/** Groq error body: `{ error: { code: 'tool_use_failed', failed_generation, ... } }`. */
const ToolUseFailedBodySchema = z.object({ error: z.object({ code: z.literal('tool_use_failed') }) });

/**
 * Groq returns 400 `tool_use_failed` when gpt-oss emits a malformed tool call.
 * It is a generation glitch, not a bad request, so it is worth one retry.
 */
export function isToolUseFailed(err: unknown): boolean {
  if (!(err instanceof APIError) || err.status !== 400) return false;
  return ToolUseFailedBodySchema.safeParse(err.error).success;
}
