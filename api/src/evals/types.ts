import { DeviceInfoSchema } from '@mylife/shared';
import { z } from 'zod';

/**
 * Shape of an agent eval case: a prompt plus the tool calls we expect.
 * Assert on outcomes (which tool, key arguments), not exact reply wording.
 * TODO(Phase 1): add a runner that drives the orchestrator with a mocked or
 * dev model and compares actual tool calls against these expectations.
 */
export const expectedToolCallSchema = z
  .object({
    tool: z.string().min(1),
    /** Subset match: listed keys must equal these values; extra args are allowed. */
    args: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const evalCaseSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    timezone: z.string().default('Asia/Manila'),
    /** Fixed "now" (UTC ISO) so time-relative prompts are deterministic. */
    now: z.iso.datetime(),
    /** Phone the request comes from; decides which device tools are offered. */
    device: DeviceInfoSchema.optional(),
    /** An empty list means the agent must not call any tool (e.g. it should ask a question). */
    expectedToolCalls: z.array(expectedToolCallSchema),
  })
  .strict();

export type EvalCase = z.infer<typeof evalCaseSchema>;
