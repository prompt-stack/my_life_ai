import { z } from 'zod';
import {
  ALARM_ID_MAX_LENGTH,
  ALARMS_MAX_IN_REQUEST,
  AlarmPermissionsSchema,
  AlarmSchema,
  CreateAlarmArgsSchema,
  DeleteAlarmArgsSchema,
  PreviewAlarmSoundArgsSchema,
  SnoozeAlarmArgsSchema,
  StopAlarmArgsSchema,
  UpdateAlarmArgsSchema,
} from './alarms.js';

/**
 * Device tools: the server agent decides, the phone executes (CLAUDE.md rule 8).
 * The app validates every action with these schemas before running its handler.
 */

/** Max length of a tool call ID echoed between server and phone. */
export const DEVICE_CALL_ID_MAX_LENGTH = 100;

/** Allowlist of device tools. The phone never runs anything outside it. */
export const DeviceToolNameSchema = z.enum([
  'createAlarm',
  'updateAlarm',
  'deleteAlarm',
  'previewAlarmSound',
  'stopAlarm',
  'snoozeAlarm',
]);
export type DeviceToolName = z.infer<typeof DeviceToolNameSchema>;

const CallIdSchema = z.string().min(1).max(DEVICE_CALL_ID_MAX_LENGTH);

/** An action the server asks the phone to perform, returned in `VoiceResponse.deviceAction`. */
export const DeviceActionSchema = z.discriminatedUnion('name', [
  z.object({ callId: CallIdSchema, name: z.literal('createAlarm'), args: CreateAlarmArgsSchema }).strict(),
  z.object({ callId: CallIdSchema, name: z.literal('updateAlarm'), args: UpdateAlarmArgsSchema }).strict(),
  z.object({ callId: CallIdSchema, name: z.literal('deleteAlarm'), args: DeleteAlarmArgsSchema }).strict(),
  z.object({ callId: CallIdSchema, name: z.literal('previewAlarmSound'), args: PreviewAlarmSoundArgsSchema }).strict(),
  z.object({ callId: CallIdSchema, name: z.literal('stopAlarm'), args: StopAlarmArgsSchema }).strict(),
  z.object({ callId: CallIdSchema, name: z.literal('snoozeAlarm'), args: SnoozeAlarmArgsSchema }).strict(),
]);
export type DeviceAction = z.infer<typeof DeviceActionSchema>;
export type DeviceActionInput = z.input<typeof DeviceActionSchema>;

/** Why a device action did not run. */
export const DeviceToolErrorSchema = z.enum([
  'unsupported_platform',
  'invalid_args',
  'failed',
  'busy',
  /** A required OS permission (e.g. Android "Alarms & reminders") is not granted. */
  'permission_required',
  /** The alarm no longer exists on the phone (or, for stop/snooze, is no longer ringing). */
  'not_found',
]);
export type DeviceToolError = z.infer<typeof DeviceToolErrorSchema>;

/** How a successful action ended. */
export const DeviceToolStatusSchema = z.enum(['done']);
export type DeviceToolStatus = z.infer<typeof DeviceToolStatusSchema>;

/** What the phone reports after trying a device action. */
export const DeviceToolResultSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      status: DeviceToolStatusSchema,
      /** The alarm as saved (after createAlarm or updateAlarm). */
      alarm: AlarmSchema.optional(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: DeviceToolErrorSchema,
      message: z.string().max(300).optional(),
    })
    .strict(),
]);
export type DeviceToolResult = z.infer<typeof DeviceToolResultSchema>;
export type DeviceToolResultInput = z.input<typeof DeviceToolResultSchema>;

/** Sent with each voice request so the server only offers tools this phone supports. */
export const DeviceInfoSchema = z
  .object({
    platform: z.enum(['android', 'ios', 'web']),
    osVersion: z.string().max(40).optional(),
    capabilities: z.array(DeviceToolNameSchema).max(20).default([]),
    /** `Build.MANUFACTURER`, e.g. "Xiaomi". */
    manufacturer: z.string().trim().max(60).optional(),
    /** `Build.BRAND`, e.g. "POCO". */
    brand: z.string().trim().max(60).optional(),
    /** `Build.MODEL`, e.g. "Pixel 9". */
    model: z.string().trim().max(60).optional(),
    /** Every MyLife alarm on this phone. */
    alarms: z.array(AlarmSchema).max(ALARMS_MAX_IN_REQUEST).optional(),
    /** OS permissions the alarms depend on. */
    alarmPermissions: AlarmPermissionsSchema.optional(),
    /** ID of the MyLife alarm ringing right now; absent when none is ringing. */
    ringingAlarmId: z.string().min(1).max(ALARM_ID_MAX_LENGTH).optional(),
  })
  .strict();
/** Parsed (output) shape: `capabilities` is always present. */
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;
/** What a client sends: `capabilities` may be omitted. */
export type DeviceInfoInput = z.input<typeof DeviceInfoSchema>;
export type DevicePlatform = DeviceInfo['platform'];
