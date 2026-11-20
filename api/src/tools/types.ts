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
