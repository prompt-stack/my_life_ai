import type { Alarm, DeviceInfo, VoiceInvocation, VoiceResponse, VoiceToolResult, VoiceTurn } from '@mylife/shared';
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'groq-sdk/resources/chat/completions';
import type { GroqConfig } from '../config/env.js';
import { toAiError, type ModelClient } from '../lib/groq.js';
import { AiNotConfiguredError, ValidationError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import { alarmSoundName, formatClockTime, formatRepeat } from '../tools/alarm-format.js';
import type { DeviceToolCatalog } from '../tools/device-catalog.js';
import { defaultDeviceToolCatalog } from '../tools/index.js';
import type { DeviceToolDefinition } from '../tools/types.js';
import { isAlarmRequest } from './alarm-intent.js';
import { deviceFailureReply } from './device-failure-replies.js';
import { isToolUseFailed, pickDeviceToolCall, toModelTools, toolResultMessages } from './voice-device-tools.js';
import { DEVICE_RESULT_SYSTEM_PROMPT, userTurnSystemPrompt, VOICE_SYSTEM_PROMPT } from './voice-prompts.js';
import { stripWakeWord } from './wake-word.js';

export const REFUSAL_REPLY = "Sorry, I can't help with that one.";
export const EMPTY_REPLY = "Sorry, I didn't catch that. Could you say it again?";
/** Spoken when Groq keeps rejecting the model's tool call (`tool_use_failed`). */
export const TOOL_TROUBLE_REPLY = 'Sorry, I had trouble with that, please try again.';
/** Continuation fallback when the model returns no text after a successful action (failures use device-failure-replies). */
export const DEVICE_DONE_REPLY = 'Done.';
/** Spoken when a wake-word turn held only the trigger ("AI" / "Hey AI"); no model call. */
export const WAKE_ONLY_REPLY = 'Yes? What can I do for you?';

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
  /** How the turn was started; `wake_word` turns get a leading "AI" stripped. Logged, never the text. */
  invocation?: VoiceInvocation;
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

const ALARM_TOOLS: ReadonlySet<string> = new Set([
  'createAlarm',
  'updateAlarm',
  'deleteAlarm',
  'previewAlarmSound',
  'stopAlarm',
  'snoozeAlarm',
]);

/** What the model should say about alarms when no alarm tools are offered. */
const ALARMS_UNAVAILABLE: Record<DeviceInfo['platform'], string> = {
  android: "Alarms aren't available in this version of the app.",
  ios: "I can't set alarms on this iPhone yet.",
  web: "I can't set alarms here.",
};

/**
 * Phone-reported strings (model name, alarm labels) are untrusted data: keep
 * letters, digits and light punctuation only, so they read as a name and can
 * never look like instructions or break the sentence they sit in.
 */
export function sanitizeDeviceText(value: string | undefined, maxLength = 60): string {
  if (!value) return '';
  return value
    .replace(/[^\p{L}\p{N} .,'&+()-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** "Xiaomi POCO F9 Pro", without repeating the maker when the model name already has it. */
function formatPhoneName(device: DeviceInfo): string {
  const maker = sanitizeDeviceText(device.manufacturer ?? device.brand);
  const model = sanitizeDeviceText(device.model);
  return model.toLowerCase().startsWith(maker.toLowerCase()) ? model : `${maker} ${model}`.trim();
}

function byTimeOfDay(a: Alarm, b: Alarm): number {
  return a.hour * 60 + a.minute - (b.hour * 60 + b.minute);
}

/** "6:30 AM, Wake up, Sunrise, every weekday" (+ ", off" when off; the label is sanitized phone text). */
function describeAlarm(alarm: Alarm): string {
  const label = sanitizeDeviceText(alarm.label);
  return [
    formatClockTime(alarm),
    ...(label ? [label] : []),
    alarmSoundName(alarm.sound),
    formatRepeat(alarm.weekdays),
    ...(alarm.enabled ? [] : ['off']),
  ].join(', ');
}

/** "Alarms: 6:30 AM, Wake up, Sunrise, every weekday; 9:00 PM, Piano, one time, off." By time of day. */
export function formatAlarmList(alarms: readonly Alarm[] | undefined): string {
  if (!alarms || alarms.length === 0) return 'No alarms yet.';
  return `Alarms: ${[...alarms].sort(byTimeOfDay).map(describeAlarm).join('; ')}.`;
}

/**
 * "An alarm is ringing now: 6:30 AM (Wake up)." from the phone's list, plus
 * what to say about snoozing when this phone can't snooze (iOS reports only
 * stopAlarm). Undefined when nothing rings.
 */
export function formatRingingAlarm(device: DeviceInfo): string | undefined {
  if (!device.ringingAlarmId) return undefined;
  const alarm = device.alarms?.find((candidate) => candidate.id === device.ringingAlarmId);
  const label = sanitizeDeviceText(alarm?.label);
  const ringing = alarm
    ? `An alarm is ringing now: ${formatClockTime(alarm)}${label ? ` (${label})` : ''}.`
    : 'An alarm is ringing now.';
  if (device.capabilities.includes('snoozeAlarm')) return ringing;
  const noSnooze =
    device.platform === 'ios'
      ? "I can't snooze alarms on iPhone yet, but I can stop it."
      : "I can't snooze alarms on this phone, but I can stop it.";
  return `${ringing} If asked to snooze, say: ${noSnooze}`;
}

/**
 * What the model hears about alarms on a normal turn:
 * - `included`: alarm tools and rules are in this request, so list the alarms.
 * - `deferred`: the phone has alarm tools but this request is not about alarms
 *   (see alarm-intent.ts), so nothing is said, to save tokens.
 * - `unavailable`: the phone has no alarm tools; one line says what to answer.
 */
export type AlarmContext = 'included' | 'deferred' | 'unavailable';

/**
 * Tells the model which phone it is on and, for a normal turn, the MyLife
 * alarms on it (or what to say when alarms are unavailable), so it answers
 * alarm questions from the list and explains missing features instead of
 * asking questions. `alarms` is omitted on the continuation turn.
 */
export function formatDeviceContext(device: DeviceInfo | undefined, alarms?: AlarmContext): string | undefined {
  if (!device) return undefined;
  const platform = PLATFORM_NAMES[device.platform];
  if (!alarms) return `The user is talking to you on ${platform}.`;

  const phoneName = formatPhoneName(device);
  const parts = [`The user is talking to you on ${platform}${phoneName ? ` (${phoneName})` : ''}.`];
  if (alarms === 'included') {
    parts.push(formatAlarmList(device.alarms));
    const ringing = formatRingingAlarm(device);
    if (ringing) parts.push(ringing);
  } else if (alarms === 'unavailable') {
    parts.push(
      `Alarms are not available here: if asked to set, change or delete one, say only: ${ALARMS_UNAVAILABLE[device.platform]}`,
    );
  }
  return parts.join(' ');
}

/** Per-request context (time, then device), sent after the stable prompt. */
function formatRequestContext(input: VoiceReplyInput, alarms?: AlarmContext): string {
  const deviceContext = formatDeviceContext(input.device, alarms);
  const timeContext = formatTimeContext(input.now, input.timezone);
  return deviceContext ? `${timeContext}\n${deviceContext}` : timeContext;
}

/**
 * The device tools to send with this request. Tools whose `offerOnlyWhen`
 * says no right now are dropped (stopAlarm and snoozeAlarm while nothing
 * rings). Alarm tools (and with them the alarm rules and list) are left out
 * when the request is clearly not about alarms: they are most of the prompt.
 * While an alarm rings they are always sent, so "stop" or "enough" works.
 * Other device tools are always sent.
 */
function toolsForRequest(
  offered: readonly DeviceToolDefinition[],
  input: VoiceReplyInput,
): { tools: readonly DeviceToolDefinition[]; alarms: AlarmContext } {
  const hasAlarmTools = offered.some((tool) => ALARM_TOOLS.has(tool.name));
  const offeredNow = offered.filter((tool) => tool.offerOnlyWhen?.(input.device) ?? true);
  if (!hasAlarmTools) return { tools: offeredNow, alarms: 'unavailable' };
  const alarmRinging = Boolean(input.device?.ringingAlarmId);
  if (isAlarmRequest(input.text, input.history, { alarmRinging })) return { tools: offeredNow, alarms: 'included' };
  return { tools: offeredNow.filter((tool) => !ALARM_TOOLS.has(tool.name)), alarms: 'deferred' };
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
  systemPrompt: string = VOICE_SYSTEM_PROMPT,
): ChatCompletionMessageParam[] {
  const firstUserIndex = history.findIndex((turn) => turn.role === 'user');
  const usable = firstUserIndex === -1 ? [] : history.slice(firstUserIndex);
  return [
    { role: 'system', content: systemPrompt },
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
  logContext: { requestId?: string; model: string; invocation?: VoiceInvocation };
  signal?: AbortSignal;
}

/** Which voice turn a model call belongs to (for logs). */
type Turn = 'user' | 'device_result';

/**
 * Timing and token details for one model call. Groq adds `queue_time`,
 * `prompt_time`, `completion_time` and `total_time` (seconds) to `usage`; the
 * gap between our latency and Groq's `total_time` is network, queueing outside
 * Groq's count, or hidden SDK retries (logged separately by the SDK logger).
 */
export function modelCallMetrics(completion: ChatCompletion): Record<string, number | string | undefined> {
  const usage = completion.usage;
  const toMs = (seconds: number | undefined) => (seconds === undefined ? undefined : Math.round(seconds * 1000));
  return {
    finishReason: completion.choices[0]?.finish_reason,
    inputTokens: usage?.prompt_tokens,
    // Groq prompt caching: input tokens served from cache (absent when the model or account has none).
    cachedTokens: usage?.prompt_tokens_details?.cached_tokens,
    outputTokens: usage?.completion_tokens,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens,
    groqQueueMs: toMs(usage?.queue_time),
    groqPromptMs: toMs(usage?.prompt_time),
    groqCompletionMs: toMs(usage?.completion_time),
    groqTotalMs: toMs(usage?.total_time),
  };
}

/**
 * Calls the model. Retries once on Groq `tool_use_failed`; returns undefined
 * if it fails again so the caller can speak an apology. Other errors map to
 * domain errors. Logs one line per attempt (latency, Groq timings, attempt,
 * whether tools were offered), never the user's text.
 */
async function createCompletion(
  params: ChatCompletionCreateParamsNonStreaming,
  ctx: CallContext,
  turn: Turn,
): Promise<ChatCompletion | undefined> {
  const toolsOffered = params.tools?.length ?? 0;
  for (let attempt = 1; attempt <= TOOL_USE_FAILED_MAX_ATTEMPTS; attempt += 1) {
    const startedAt = performance.now();
    const latencyMs = () => Math.round(performance.now() - startedAt);
    try {
      const completion = await ctx.client.chat.completions.create(
        params,
        ctx.signal ? { signal: ctx.signal } : undefined,
      );
      ctx.logger.info(
        { ...ctx.logContext, turn, attempt, toolsOffered, latencyMs: latencyMs(), ...modelCallMetrics(completion) },
        'model call completed',
      );
      return completion;
    } catch (err) {
      if (!isToolUseFailed(err)) {
        ctx.logger.info({ ...ctx.logContext, turn, attempt, toolsOffered, latencyMs: latencyMs() }, 'model call failed');
        throw toAiError(err, ctx.logger, ctx.logContext);
      }
      // `failed_generation` may echo the user's words, so it is never logged.
      ctx.logger.warn(
        { ...ctx.logContext, turn, attempt, toolsOffered, latencyMs: latencyMs() },
        'model produced an invalid tool call (tool_use_failed)',
      );
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

/** One summary line per voice turn; `latencyMs` covers every attempt, including a tool_use_failed retry. */
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

  // Failures get a fixed reply per error code (no model call), so the reason is never confused.
  if (!toolResult.result.ok) {
    return {
      reply: deviceFailureReply(toolResult, toolResult.result.error, input.device),
    };
  }

  const messages = [
    ...toMessageParams(input.history, input.text, formatRequestContext(input), DEVICE_RESULT_SYSTEM_PROMPT),
    ...toolResultMessages(toolResult),
  ];
  const startedAt = performance.now();
  const completion = await createCompletion(buildParams(messages, config, []), ctx, 'device_result');
  if (!completion) return { reply: TOOL_TROUBLE_REPLY };

  logCompletion(completion, ctx, startedAt, { turn: 'device_result' });
  if (wasFiltered(completion)) return { reply: REFUSAL_REPLY };
  return { reply: spokenText(completion, ctx, DEVICE_DONE_REPLY) };
}

/**
 * One voice turn: transcript in, short speakable reply out. When the model
 * calls a device tool offered for this phone, the response also carries a
 * validated `deviceAction` for the phone to run.
 */
export async function generateVoiceReply(
  rawInput: VoiceReplyInput,
  deps: VoiceAssistantDeps,
): Promise<VoiceResponse> {
  const { client, config, logger } = deps;
  // A continuation repeats the first request's text, so it is stripped the same way.
  const input = rawInput.invocation === 'wake_word' ? { ...rawInput, text: stripWakeWord(rawInput.text) } : rawInput;
  if (input.text.length === 0 && !input.toolResult) {
    logger.info({ requestId: input.requestId, invocation: input.invocation }, 'wake word only, no request');
    return { reply: WAKE_ONLY_REPLY };
  }
  if (!client) throw new AiNotConfiguredError();

  const ctx: CallContext = {
    client,
    logger,
    logContext: { requestId: input.requestId, model: config.model, invocation: input.invocation },
    ...(input.signal ? { signal: input.signal } : {}),
  };
  const offered = (deps.deviceTools ?? defaultDeviceToolCatalog).availableFor(input.device);

  if (input.toolResult) {
    return continueAfterDeviceAction(input, input.toolResult, offered, ctx, config);
  }

  const { tools, alarms } = toolsForRequest(offered, input);
  const toolNames = tools.map((tool) => tool.name);
  const messages = toMessageParams(
    input.history,
    input.text,
    formatRequestContext(input, alarms),
    userTurnSystemPrompt(alarms === 'included'),
  );
  const startedAt = performance.now();
  const completion = await createCompletion(buildParams(messages, config, tools), ctx, 'user');
  if (!completion) return { reply: TOOL_TROUBLE_REPLY };

  const outcome = pickDeviceToolCall(completion.choices[0]?.message.tool_calls, tools, input.device, input.text);
  logCompletion(completion, ctx, startedAt, {
    turn: 'user',
    toolsOffered: toolNames,
    alarmContext: input.device ? alarms : undefined,
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

  if (outcome.kind === 'reply') {
    // No action yet: e.g. the spoken time was not an exact known alarm, so ask before acting.
    logger.info(
      { ...ctx.logContext, tool: outcome.tool.name, callId: outcome.callId },
      'device action needs confirmation',
    );
    return { reply: outcome.reply };
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
