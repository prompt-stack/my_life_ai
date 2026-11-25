import { z } from 'zod';

/**
 * Device tools: the server agent decides, the phone executes (CLAUDE.md rule 8).
 * The app validates every action with these schemas before running its handler.
 */

/** Max length of a tool call ID echoed between server and phone. */
export const DEVICE_CALL_ID_MAX_LENGTH = 100;

/** `setAlarm` arguments. The phone sets the alarm for the next occurrence of this time of day. */
export const SetAlarmArgsSchema = z
  .object({
    /** 24-hour clock. */
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    /** Short label shown in the Clock app, e.g. "Wake up". */
    label: z.string().trim().min(1).max(60).optional(),
  })
  .strict();
export type SetAlarmArgs = z.infer<typeof SetAlarmArgsSchema>;
export type SetAlarmArgsInput = z.input<typeof SetAlarmArgsSchema>;

/** Allowlist of device tools. The phone never runs anything outside it. */
export const DeviceToolNameSchema = z.enum(['setAlarm']);
export type DeviceToolName = z.infer<typeof DeviceToolNameSchema>;

const CallIdSchema = z.string().min(1).max(DEVICE_CALL_ID_MAX_LENGTH);

/** An action the server asks the phone to perform, returned in `VoiceResponse.deviceAction`. */
export const DeviceActionSchema = z.discriminatedUnion('name', [
  z.object({ callId: CallIdSchema, name: z.literal('setAlarm'), args: SetAlarmArgsSchema }).strict(),
]);
export type DeviceAction = z.infer<typeof DeviceActionSchema>;
export type DeviceActionInput = z.input<typeof DeviceActionSchema>;

/** Why a device action did not run. */
export const DeviceToolErrorSchema = z.enum(['unsupported_platform', 'no_clock_app', 'busy', 'invalid_args', 'failed']);
export type DeviceToolError = z.infer<typeof DeviceToolErrorSchema>;

/** What the phone reports after trying a device action. */
export const DeviceToolResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), status: z.literal('dispatched') }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: DeviceToolErrorSchema,
      message: z.string().max(300).optional(),
    })
    .strict(),
]);
export type DeviceToolResult = z.infer<typeof DeviceToolResultSchema>;

/** Sent with each voice request so the server only offers tools this phone supports. */
export const DeviceInfoSchema = z
  .object({
    platform: z.enum(['android', 'ios', 'web']),
    osVersion: z.string().max(40).optional(),
    capabilities: z.array(DeviceToolNameSchema).max(20).default([]),
  })
  .strict();
/** Parsed (output) shape: `capabilities` is always present. */
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;
/** What a client sends: `capabilities` may be omitted. */
export type DeviceInfoInput = z.input<typeof DeviceInfoSchema>;
export type DevicePlatform = DeviceInfo['platform'];
