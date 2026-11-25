import type { DeviceInfo, VoiceResponse, VoiceToolResult, VoiceTurn } from '@mylife/shared';
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'groq-sdk/resources/chat/completions';
import type { GroqConfig } from '../config/env.js';
import { toAiError, type ModelClient } from '../lib/groq.js';
import { AiNotConfiguredError, ValidationError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { DeviceToolCatalog } from '../tools/device-catalog.js';
import { defaultDeviceToolCatalog } from '../tools/index.js';
import type { DeviceToolDefinition } from '../tools/types.js';
import { isToolUseFailed, pickDeviceToolCall, toModelTools, toolResultMessages } from './voice-device-tools.js';

/**
 * Stable instructions. Kept first and byte-identical across requests so the
 * prefix stays cacheable; the per-request time and device message comes after it.
 */
export const VOICE_SYSTEM_PROMPT = [
  'You are MyLife AI, a friendly personal voice assistant.',
  'Your replies are read aloud by text-to-speech, so answer in one to three short, conversational sentences.',
  'Use plain spoken text only: no markdown, lists, headings, emoji, URLs or code.',
  'Write numbers, times and dates the way a person would say them.',
  // Phone actions. Risk levels and capability checks are enforced in code; these lines only shape the conversation.
  'You can act on the phone only through the tools provided in this request, and which tools are provided depends on the phone. Never say you did something on the phone unless a tool result says it succeeded.',
  'You cannot set timers, send texts, place calls, change settings, or add calendar events or tasks yet. If asked, say briefly that it is coming soon, then offer to help another way.',
  'Alarms. Apply these rules in order.',
  '1. If the setAlarm tool is not provided in this request, you cannot set alarms on this phone. Say so right away and do not ask any questions about the time. On an iPhone, say: I can\'t set alarms on iPhone yet.',
  '2. A time that includes AM or PM in any form (AM, am, a.m., PM, pm, p.m.) is complete: call setAlarm right away and never ask "AM or PM?". Also complete: 24-hour times like 18:00, noon, midnight, "in the morning", "in the evening", "tonight", and relative times like "in 20 minutes" or "in an hour". For a relative time, add it to the current local time given in the next message and round to the minute.',
  '3. Ask a question only if the time is missing (for "set an alarm", ask what time) or if the user gives an hour from 1 to 12 with no AM or PM and nothing else settles it (for "at 7" or "at 7:30", ask "7 AM or 7 PM?").',
  'Examples: "Set an alarm for 7 AM" means setAlarm with hour 7, minute 0. "Alarm at 7 p.m." means hour 19, minute 0. "Wake me at 6:30am" means hour 6, minute 30. "Set an alarm at 7" means ask "7 AM or 7 PM?".',
  'setAlarm takes the hour in 24-hour form and the minute. The phone sets the alarm for the next time that clock time comes around. If the user asks for a specific other day or date, such as next Friday, explain that you can only set it for the next time that clock time comes around and ask if that is OK. Repeating alarms are not supported yet.',
  'If the user says what the alarm is for, such as wake up or take medicine, pass it as a short label; otherwise leave the label out. Call setAlarm at most once per request.',
  'When a setAlarm result says ok, confirm the time in 12-hour spoken form, for example: Done, your alarm is set for 6:30 AM. If it failed, say so honestly in one sentence and suggest what the user can do.',
  'If you do not know something or it depends on live data you do not have, say so honestly instead of guessing.',
].join('\n');

export const REFUSAL_REPLY = "Sorry, I can't help with that one.";
export const EMPTY_REPLY = "Sorry, I didn't catch that. Could you say it again?";
/** Spoken when Groq keeps rejecting the model's tool call (`tool_use_failed`). */
export const TOOL_TROUBLE_REPLY = 'Sorry, I had trouble with that, please try again.';
/** Continuation fallbacks when the model returns no text. Never claim success unless the phone said ok. */
export const DEVICE_DONE_REPLY = 'Done.';
export const DEVICE_FAILED_REPLY = "Sorry, I couldn't do that on your phone.";

/** One try plus one retry for Groq `tool_use_failed`. */
export const TOOL_USE_FAILED_MAX_ATTEMPTS = 2;

/** Modest randomness: natural-sounding speech without drifting off-topic. */
export const VOICE_TEMPERATURE = 0.6;

export interface VoiceReplyInput {
  /** The user's transcribed speech (already validated and trimmed). */
  text: string;
  /** Earlier turns, oldest first. */
  history: VoiceTurn[];
  /** IANA timezone for the time context. */
  timezone: string;
  now: Date;
  /** Phone platform and capabilities; decides which device tools are offered. */
  device?: DeviceInfo;
  /** Set on the continuation turn after the phone ran a device action. */
  toolResult?: VoiceToolResult;
  requestId?: string;
  /** Aborts the model call when the client disconnects. */
  signal?: AbortSignal;
}

export interface VoiceAssistantDeps {
  /** Undefined when GROQ_API_KEY is not configured. */
  client: ModelClient | undefined;
  config: Pick<GroqConfig, 'model' | 'maxTokens' | 'reasoningEffort'>;
  logger: Logger;
  /** Defaults to the registered device tools. Tests may pass their own. */
  deviceTools?: DeviceToolCatalog;
}

/** Formats the current time the way the model should reason about it. */
export function formatTimeContext(now: Date, timezone: string): string {
  const local = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(now);
  return `Current date and time for the user: ${local} (${timezone}). UTC: ${now.toISOString()}.`;
}

const PLATFORM_NAMES: Record<DeviceInfo['platform'], string> = {
  android: 'an Android phone',
  ios: 'an iPhone',
  web: 'a web browser',
};

/**
 * Tells the model which phone it is on and, for a normal turn, exactly which
 * phone tools it has, so it explains missing features instead of asking
 * questions about them. `toolNames` is omitted on the continuation turn.
 */
export function formatDeviceContext(
  device: DeviceInfo | undefined,
  toolNames?: readonly string[],
): string | undefined {
  if (!device) return undefined;
  const platformLine = `The user is talking to you on ${PLATFORM_NAMES[device.platform]}.`;
  if (!toolNames) return platformLine;
  const toolsLine =
    toolNames.length > 0
      ? `Phone tools available on this phone: ${toolNames.join(', ')}.`
      : 'No phone tools are available on this phone, so you cannot set alarms here.';
  return `${platformLine} ${toolsLine}`;
}

/** Per-request context (time, then device), sent after the stable prompt. */
function formatRequestContext(input: VoiceReplyInput, toolNames?: readonly string[]): string {
  const deviceContext = formatDeviceContext(input.device, toolNames);
  const timeContext = formatTimeContext(input.now, input.timezone);
  return deviceContext ? `${timeContext}\n${deviceContext}` : timeContext;
}

/**
 * Maps app history to chat messages: stable system prompt, then the time
 * context, then the turns. Leading assistant turns are dropped so the
 * conversation always opens with the user.
 */
export function toMessageParams(
  history: VoiceTurn[],
  text: string,
  timeContext: string,
): ChatCompletionMessageParam[] {
  const firstUserIndex = history.findIndex((turn) => turn.role === 'user');
  const usable = firstUserIndex === -1 ? [] : history.slice(firstUserIndex);
  return [
    { role: 'system', content: VOICE_SYSTEM_PROMPT },
    { role: 'system', content: timeContext },
    ...usable.map((turn): ChatCompletionMessageParam => ({ role: turn.role, content: turn.text })),
    { role: 'user', content: text },
  ];
}

/**
 * Removes reasoning that some models (e.g. Qwen, DeepSeek distills) inline as
 * `<think>…</think>`. The reply is spoken aloud, so the user must never hear it.
 * Also handles a missing opening tag and a block cut off by max tokens.
 */
export function stripReasoning(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*?<\/think>/i, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim();
}

function buildParams(
  messages: ChatCompletionMessageParam[],
  config: VoiceAssistantDeps['config'],
  tools: readonly DeviceToolDefinition[],
): ChatCompletionCreateParamsNonStreaming {
  return {
    model: config.model,
    messages,
    max_completion_tokens: config.maxTokens,
    temperature: VOICE_TEMPERATURE,
    // Non-reasoning models reject these, so `off` omits both. When set, leave the
    // reasoning out of the response so it never reaches the spoken reply.
    // (`include_reasoning` and `reasoning_format` are mutually exclusive: 400 if both.)
    ...(config.reasoningEffort === 'off'
      ? {}
      : { reasoning_effort: config.reasoningEffort, include_reasoning: false }),
    // One device action per turn. `required` is unreliable on gpt-oss, so let the model choose.
    ...(tools.length > 0
      ? { tools: toModelTools(tools), tool_choice: 'auto' as const, parallel_tool_calls: false }
      : {}),
  };
}

interface CallContext {
  client: ModelClient;
  logger: Logger;
  logContext: { requestId?: string; model: string };
  signal?: AbortSignal;
}

/**
 * Calls the model. Retries once on Groq `tool_use_failed`; returns undefined
 * if it fails again so the caller can speak an apology. Other errors map to
 * domain errors.
 */
async function createCompletion(
  params: ChatCompletionCreateParamsNonStreaming,
  ctx: CallContext,
): Promise<ChatCompletion | undefined> {
  for (let attempt = 1; attempt <= TOOL_USE_FAILED_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await ctx.client.chat.completions.create(params, ctx.signal ? { signal: ctx.signal } : undefined);
    } catch (err) {
      if (!isToolUseFailed(err)) throw toAiError(err, ctx.logger, ctx.logContext);
      // `failed_generation` may echo the user's words, so it is never logged.
      ctx.logger.warn({ ...ctx.logContext, attempt }, 'model produced an invalid tool call (tool_use_failed)');
    }
  }
  return undefined;
}

/** Reply text with reasoning removed, or `fallback` when nothing speakable is left. */
function spokenText(completion: ChatCompletion, ctx: CallContext, fallback: string): string {
  const choice = completion.choices[0];
  const reply = stripReasoning(choice?.message.content ?? '');
  if (reply.length > 0) return reply;
  // finishReason 'length' here usually means reasoning used up max_completion_tokens.
  ctx.logger.warn({ ...ctx.logContext, finishReason: choice?.finish_reason }, 'model returned no text');
  return fallback;
}

function logCompletion(completion: ChatCompletion, ctx: CallContext, startedAt: number, extra: object): void {
  // TODO(Phase 1): write this to agent_runs instead of only logging it (CLAUDE.md rule 6).
  ctx.logger.info(
    {
      ...ctx.logContext,
      ...extra,
      finishReason: completion.choices[0]?.finish_reason,
      inputTokens: completion.usage?.prompt_tokens,
      outputTokens: completion.usage?.completion_tokens,
      latencyMs: Math.round(performance.now() - startedAt),
    },
    'voice reply generated',
  );
}

/** The SDK type omits `content_filter`, but the API can return it, so widen. */
function wasFiltered(completion: ChatCompletion): boolean {
  const finishReason: string | undefined = completion.choices[0]?.finish_reason;
  return finishReason === 'content_filter';
}

/**
 * Continuation: the phone ran the action and reported back. The model gets
 * the round trip and writes the spoken confirmation. No tools are offered, so
 * this turn can never trigger another action (no loops).
 */
async function continueAfterDeviceAction(
  input: VoiceReplyInput,
  toolResult: VoiceToolResult,
  offered: readonly DeviceToolDefinition[],
  ctx: CallContext,
  config: VoiceAssistantDeps['config'],
): Promise<VoiceResponse> {
  // The phone may only report results for tools this server would offer it.
  // Widened to string: with one registered tool the literal types would always match.
  const offeredNames = new Set<string>(offered.map((tool) => tool.name));
  if (!offeredNames.has(toolResult.name)) {
    ctx.logger.warn(
      { ...ctx.logContext, tool: toolResult.name, callId: toolResult.callId },
      'tool result for a tool not offered to this device',
    );
    throw new ValidationError('Tool result does not match the device capabilities', [
      { path: 'body.toolResult.name', message: 'This device tool is not available for the reported device' },
    ]);
  }

  // TODO(Phase 1): write a tool_calls row with the device result (CLAUDE.md rule 6).
  ctx.logger.info(
    {
      ...ctx.logContext,
      tool: toolResult.name,
      callId: toolResult.callId,
      resultOk: toolResult.result.ok,
      resultError: toolResult.result.ok ? undefined : toolResult.result.error,
    },
    'device tool result received',
  );

  const messages = [
    ...toMessageParams(input.history, input.text, formatRequestContext(input)),
    ...toolResultMessages(toolResult),
  ];
  const startedAt = performance.now();
  const completion = await createCompletion(buildParams(messages, config, []), ctx);
  if (!completion) return { reply: TOOL_TROUBLE_REPLY };

  logCompletion(completion, ctx, startedAt, { turn: 'device_result' });
  if (wasFiltered(completion)) return { reply: REFUSAL_REPLY };
  return { reply: spokenText(completion, ctx, toolResult.result.ok ? DEVICE_DONE_REPLY : DEVICE_FAILED_REPLY) };
}

/**
 * One voice turn: transcript in, short speakable reply out. When the model
 * calls a device tool offered for this phone, the response also carries a
 * validated `deviceAction` for the phone to run.
 */
export async function generateVoiceReply(input: VoiceReplyInput, deps: VoiceAssistantDeps): Promise<VoiceResponse> {
  const { client, config, logger } = deps;
  if (!client) throw new AiNotConfiguredError();

  const ctx: CallContext = {
    client,
    logger,
    logContext: { requestId: input.requestId, model: config.model },
    ...(input.signal ? { signal: input.signal } : {}),
  };
  const offered = (deps.deviceTools ?? defaultDeviceToolCatalog).availableFor(input.device);

  if (input.toolResult) {
    return continueAfterDeviceAction(input, input.toolResult, offered, ctx, config);
  }

  const toolNames = offered.map((tool) => tool.name);
  const messages = toMessageParams(input.history, input.text, formatRequestContext(input, toolNames));
  const startedAt = performance.now();
  const completion = await createCompletion(buildParams(messages, config, offered), ctx);
  if (!completion) return { reply: TOOL_TROUBLE_REPLY };

  const outcome = pickDeviceToolCall(completion.choices[0]?.message.tool_calls, offered);
  logCompletion(completion, ctx, startedAt, {
    turn: 'user',
    toolsOffered: toolNames,
    toolCall: outcome.kind === 'none' ? undefined : outcome.kind,
  });

  if (wasFiltered(completion)) return { reply: REFUSAL_REPLY };

  if (outcome.kind === 'invalid') {
    // TODO(Phase 1): write a tool_calls row for the rejected call (CLAUDE.md rule 6).
    logger.warn(
      { ...ctx.logContext, tool: outcome.tool.name, callId: outcome.callId, valid: false },
      'model called a device tool with invalid arguments',
    );
    return { reply: outcome.tool.clarificationReply };
  }

  if (outcome.kind === 'action') {
    // TODO(Phase 1): write a tool_calls row for the dispatched action (CLAUDE.md rule 6).
    logger.info(
      { ...ctx.logContext, tool: outcome.action.name, callId: outcome.action.callId, valid: true },
      'device action requested',
    );
    // Empty text is fine here: the phone acts, then the continuation turn speaks the confirmation.
    return { reply: stripReasoning(completion.choices[0]?.message.content ?? ''), deviceAction: outcome.action };
  }

  if (outcome.ignoredToolNames.length > 0) {
    logger.warn({ ...ctx.logContext, tools: outcome.ignoredToolNames }, 'model called a tool that was not offered');
  }
  return { reply: spokenText(completion, ctx, EMPTY_REPLY) };
}
