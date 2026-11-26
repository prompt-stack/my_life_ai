import { DeviceInfoSchema, VoiceTurnSchema } from '@mylife/shared';
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
    /** Earlier turns, e.g. a confirmation question the user now answers. */
    history: z.array(VoiceTurnSchema).optional(),
    /** Phone the request comes from; decides which device tools are offered. */
    device: DeviceInfoSchema.optional(),
    /**
     * Tool calls the model should make. An empty list means no tool call (e.g. it should ask a question).
     * Server-side resolution may still turn a call into a spoken question (see `expectedReplyIncludes`).
     */
    expectedToolCalls: z.array(expectedToolCallSchema),
    /** Case-insensitive substrings the final spoken reply must contain (outcomes, not exact wording). */
    expectedReplyIncludes: z.array(z.string().min(1)).optional(),
    /** Whether the final response must (true) or must not (false) carry a deviceAction. */
    expectDeviceAction: z.boolean().optional(),
  })
  .strict();

export type EvalCase = z.infer<typeof evalCaseSchema>;
