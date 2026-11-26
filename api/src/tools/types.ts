import type { DeviceInfo, DevicePlatform, DeviceToolName } from '@mylife/shared';
import type { z } from 'zod';

export const RISK_LEVELS = ['read', 'write', 'sensitive'] as const;
/**
 * - read: no side effects.
 * - write: changes the user's own data (create task, save memory).
 * - sensitive: send email, delete data, spend money. Never executed directly;
 *   creates an `approvals` row and pauses the run (rule 5).
 */
export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * Where a tool runs. `device` tools (calendar on phone, contacts, local
 * notifications) are executed by the mobile app; the server only requests them.
 */
export type ToolTarget = 'server' | 'device';

/** Per-run context. `userId` comes from the verified JWT, never from model output. */
export interface ToolContext {
  userId: string;
  /** User's IANA timezone (default Asia/Manila). */
  timezone: string;
  /** Current time for this run, so results are deterministic in tests. */
  now: Date;
  requestId?: string;
}

export interface ToolSuccess<T> {
  ok: true;
  data: T;
}
export interface ToolFailure {
  ok: false;
  code: string;
  message: string;
}
/** Structured result so the agent can explain failures instead of crashing. */
export type ToolResult<T> = ToolSuccess<T> | ToolFailure;

export interface ToolDefinition<TInput extends z.ZodType = z.ZodType, TOutput = unknown> {
  /** Stable snake_case name exposed to the model. */
  name: string;
  description: string;
  riskLevel: RiskLevel;
  target: ToolTarget;
  /** Every argument from the model is parsed with this before `execute` runs. */
  input: TInput;
  // Method syntax (not an arrow property) on purpose: it lets a registry hold
  // tools with different input types as `ToolDefinition` without `any`.
  execute(ctx: ToolContext, input: z.infer<TInput>): Promise<ToolResult<TOutput>>;
}

export function toolOk<T>(data: T): ToolSuccess<T> {
  return { ok: true, data };
}

export function toolError(code: string, message: string): ToolFailure {
  return { ok: false, code, message };
}

/** Identity helper that keeps the input/output types inferred at the definition site. */
export function defineTool<TInput extends z.ZodType, TOutput>(
  tool: ToolDefinition<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
  return tool;
}

/** JSON Schema object shown to the model as a tool's `parameters`. */
export type JsonSchemaObject = Record<string, unknown>;

/** What server code knows when it turns a validated model call into a phone action. */
export interface DeviceToolResolveContext {
  /** The phone's report: platform, capabilities and the MyLife alarms on it. */
  device: DeviceInfo | undefined;
  /**
   * The user's words for this turn (untrusted data, only pattern-matched, never
   * prompted). Lets a tool check that a value the model filled in was actually
   * said, e.g. snooze minutes. Absent in callers that have no transcript.
   */
  userText?: string;
}

/**
 * Deterministic server-side step after the model calls a device tool:
 * - `action`: send these arguments to the phone (re-validated with the shared schema).
 * - `reply`: speak this instead of acting, e.g. a confirmation question.
 */
export type DeviceToolResolution = { kind: 'action'; args: unknown } | { kind: 'reply'; reply: string };

/**
 * A tool the phone executes (CLAUDE.md rule 8). The server only offers it to
 * the model and validates the arguments; it never runs anything itself, so
 * there is no `execute`. The phone's handler lives in `mobile_app/src/device/`.
 */
export interface DeviceToolDefinition<TArgs extends z.ZodType = z.ZodType, TModelArgs extends z.ZodType = TArgs> {
  /** Name from the shared allowlist; the same string the model and the phone see. */
  name: DeviceToolName;
  description: string;
  riskLevel: RiskLevel;
  target: 'device';
  /** Platforms whose app can run this tool. */
  platforms: readonly DevicePlatform[];
  /** Shared Zod schema for the action the phone receives. */
  input: TArgs;
  /**
   * Schema for what the model may send, when it differs from `input` (e.g. without
   * server-only fields such as `alarmId`). Defaults to `input`.
   */
  modelInput?: TModelArgs;
  /** Hand-written JSON Schema mirroring `modelInput ?? input` (kept in sync by a test). */
  parameters: JsonSchemaObject;
  /** Spoken when the model calls the tool with arguments that fail validation. */
  clarificationReply: string;
  /**
   * Extra condition for offering the tool to the model on a user turn, on top of
   * the catalog's platform + capability check (e.g. stopAlarm only while an alarm
   * rings). Not applied to the continuation turn: by then the state has changed
   * (the alarm stopped), and the phone's result must still be accepted.
   */
  offerOnlyWhen?(device: DeviceInfo | undefined): boolean;
  /** Turns validated model arguments into an action or a reply. Default: act with the arguments as given. */
  resolve?(args: z.infer<TModelArgs>, ctx: DeviceToolResolveContext): DeviceToolResolution;
}

/** Identity helper that keeps the argument types inferred at the definition site. */
export function defineDeviceTool<TArgs extends z.ZodType, TModelArgs extends z.ZodType = TArgs>(
  tool: DeviceToolDefinition<TArgs, TModelArgs>,
): DeviceToolDefinition<TArgs, TModelArgs> {
  return tool;
}
