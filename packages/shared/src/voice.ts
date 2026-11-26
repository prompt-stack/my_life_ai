import { z } from 'zod';
import {
  CreateAlarmArgsSchema,
  DeleteAlarmArgsSchema,
  PreviewAlarmSoundArgsSchema,
  SnoozeAlarmArgsSchema,
  StopAlarmArgsSchema,
  UpdateAlarmArgsSchema,
} from './alarms.js';
import { DEVICE_CALL_ID_MAX_LENGTH, DeviceActionSchema, DeviceInfoSchema, DeviceToolResultSchema } from './device.js';
import { isValidTimeZone } from './time.js';

/** Max characters for one spoken turn (user transcript or assistant reply). */
export const VOICE_TEXT_MAX_LENGTH = 2000;
/** Max earlier turns the app may send as context. */
export const VOICE_HISTORY_MAX_TURNS = 20;

/** One earlier turn of the voice conversation, kept by the app. */
export const VoiceTurnSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    text: z.string().min(1).max(VOICE_TEXT_MAX_LENGTH),
  })
  .strict();
export type VoiceTurn = z.infer<typeof VoiceTurnSchema>;

/**
 * Continuation turn: the phone ran `deviceAction` and reports the outcome.
 * `callId`, `name` and `args` echo the action exactly; the server re-validates them.
 */
const ToolResultCallIdSchema = z.string().min(1).max(DEVICE_CALL_ID_MAX_LENGTH);

export const VoiceToolResultSchema = z.discriminatedUnion('name', [
  z
    .object({
      callId: ToolResultCallIdSchema,
      name: z.literal('createAlarm'),
      args: CreateAlarmArgsSchema,
      result: DeviceToolResultSchema,
    })
    .strict(),
  z
    .object({
      callId: ToolResultCallIdSchema,
      name: z.literal('updateAlarm'),
      args: UpdateAlarmArgsSchema,
      result: DeviceToolResultSchema,
    })
    .strict(),
  z
    .object({
      callId: ToolResultCallIdSchema,
      name: z.literal('deleteAlarm'),
      args: DeleteAlarmArgsSchema,
      result: DeviceToolResultSchema,
    })
    .strict(),
  z
    .object({
      callId: ToolResultCallIdSchema,
      name: z.literal('previewAlarmSound'),
      args: PreviewAlarmSoundArgsSchema,
      result: DeviceToolResultSchema,
    })
    .strict(),
  z
    .object({
      callId: ToolResultCallIdSchema,
      name: z.literal('stopAlarm'),
      args: StopAlarmArgsSchema,
      result: DeviceToolResultSchema,
    })
    .strict(),
  z
    .object({
      callId: ToolResultCallIdSchema,
      name: z.literal('snoozeAlarm'),
      args: SnoozeAlarmArgsSchema,
      result: DeviceToolResultSchema,
    })
    .strict(),
]);
export type VoiceToolResult = z.infer<typeof VoiceToolResultSchema>;
export type VoiceToolResultInput = z.input<typeof VoiceToolResultSchema>;

/**
 * How the user started this voice turn: tapping the orb, saying the trigger
 * word "AI", a speak button elsewhere in the app, or a deep link. Used for
 * logs, and so the server can strip a leftover trigger word from `wake_word` turns.
 */
export const VoiceInvocationSchema = z.enum(['tap', 'wake_word', 'speak_button', 'deep_link']);
export type VoiceInvocation = z.infer<typeof VoiceInvocationSchema>;

/** `POST /voice` request body: the on-device transcript plus recent history. */
export const VoiceRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(VOICE_TEXT_MAX_LENGTH),
    history: z.array(VoiceTurnSchema).max(VOICE_HISTORY_MAX_TURNS).default([]),
    /** The phone's IANA timezone, e.g. `Asia/Manila`. The server default applies when omitted. */
    timezone: z.string().max(64).refine(isValidTimeZone, { message: 'Must be a valid IANA timezone' }).optional(),
    /** Platform and supported device tools. Without it the server offers no device tools. */
    device: DeviceInfoSchema.optional(),
    /**
     * Set only on the continuation request after the phone ran a `deviceAction`.
     * `text` and `history` must be the same as in the request that produced the action.
     */
    toolResult: VoiceToolResultSchema.optional(),
    /** How this turn was started. Optional so older app builds keep working. */
    invocation: VoiceInvocationSchema.optional(),
  })
  .strict();
/** Parsed (output) shape: `history` is always present. */
export type VoiceRequest = z.infer<typeof VoiceRequestSchema>;
/** What a client sends: `history` may be omitted. */
export type VoiceRequestInput = z.input<typeof VoiceRequestSchema>;

/**
 * `POST /voice` 200 response body. The app speaks `reply` with on-device TTS
 * (it may be empty when `deviceAction` is set). When `deviceAction` is present
 * the app validates and runs it, then sends a continuation request with `toolResult`.
 */
export const VoiceResponseSchema = z
  .object({
    reply: z.string(),
    deviceAction: DeviceActionSchema.optional(),
  })
  .strict();
export type VoiceResponse = z.infer<typeof VoiceResponseSchema>;
export type VoiceResponseInput = z.input<typeof VoiceResponseSchema>;
