import { z } from 'zod';

/**
 * MyLife-owned alarms (CLAUDE.md rule 3 exception): the phone's native module
 * schedules, stores and rings them, and reports the full list with each voice
 * request. The server agent decides what to change; the phone executes it.
 */

/** Max length of an alarm ID chosen by the phone. */
export const ALARM_ID_MAX_LENGTH = 64;
/** Max length of an alarm label. */
export const ALARM_LABEL_MAX_LENGTH = 60;
/** Max alarms the phone reports in `DeviceInfo.alarms`. */
export const ALARMS_MAX_IN_REQUEST = 30;

/** The five bundled alarm sounds. */
export const AlarmSoundIdSchema = z.enum(['sunrise', 'chimes', 'marimba', 'piano', 'guitar']);
export type AlarmSoundId = z.infer<typeof AlarmSoundIdSchema>;

/** Used when the user does not name a sound. */
export const DEFAULT_ALARM_SOUND: AlarmSoundId = 'sunrise';

export interface AlarmSound {
  id: AlarmSoundId;
  /** Display and spoken name, e.g. "Sunrise". */
  name: string;
  /** Other lowercase words people use for this sound. */
  aliases: readonly string[];
}

export const ALARM_SOUNDS: readonly AlarmSound[] = [
  { id: 'sunrise', name: 'Sunrise', aliases: ['default', 'normal', 'regular', 'standard'] },
  { id: 'chimes', name: 'Chimes', aliases: ['chime', 'bells', 'bell', 'wind chimes'] },
  { id: 'marimba', name: 'Marimba', aliases: ['xylophone'] },
  { id: 'piano', name: 'Piano', aliases: ['keys', 'keyboard', 'the piano one'] },
  { id: 'guitar', name: 'Guitar', aliases: ['acoustic', 'acoustic guitar', 'strings'] },
];

/** Filler words people add around a sound name ("the piano one", "chimes sound"). */
const SOUND_FILLER_WORDS: ReadonlySet<string> = new Set(['the', 'a', 'one', 'sound', 'sounds']);

function soundKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0 && !SOUND_FILLER_WORDS.has(word))
    .join(' ');
}

const SOUND_BY_KEY: ReadonlyMap<string, AlarmSoundId> = new Map(
  ALARM_SOUNDS.flatMap((sound) =>
    [sound.id, sound.name, ...sound.aliases].map((text): [string, AlarmSoundId] => [soundKey(text), sound.id]),
  ),
);

/**
 * Maps a spoken or model-provided sound name to its ID: case, spacing and
 * punctuation are ignored, and filler words ("the", "one", "sound") are dropped.
 * Returns null when it is not one of the bundled sounds.
 */
export function normalizeAlarmSound(input: string): AlarmSoundId | null {
  const key = soundKey(input);
  if (key === '') return null;
  return SOUND_BY_KEY.get(key) ?? null;
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const WeekdaySchema = z.number().int().min(1).max(7);
export type Weekday = z.infer<typeof WeekdaySchema>;

/** Repeat days in an action; each day at most once. */
const WeekdayListSchema = z
  .array(WeekdaySchema)
  .max(7)
  .refine((days) => new Set(days).size === days.length, { message: 'Weekdays must not repeat' });

const AlarmIdSchema = z.string().min(1).max(ALARM_ID_MAX_LENGTH);
const HourSchema = z.number().int().min(0).max(23);
const MinuteSchema = z.number().int().min(0).max(59);
const LabelSchema = z.string().trim().min(1).max(ALARM_LABEL_MAX_LENGTH);

/** A clock time of day (24-hour). */
export const AlarmTimeSchema = z.object({ hour: HourSchema, minute: MinuteSchema }).strict();
export type AlarmTime = z.infer<typeof AlarmTimeSchema>;

/** One MyLife alarm as stored by the phone. */
export const AlarmSchema = z
  .object({
    id: AlarmIdSchema,
    /** 24-hour clock, in the phone's local time. */
    hour: HourSchema,
    minute: MinuteSchema,
    /** Repeat days; `[]` means a one-time alarm. */
    weekdays: z.array(WeekdaySchema).max(7),
    label: LabelSchema.optional(),
    sound: AlarmSoundIdSchema,
    enabled: z.boolean(),
    /** Next time it rings (ISO 8601 with `Z` or an offset); null when off. */
    nextTriggerAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type Alarm = z.infer<typeof AlarmSchema>;
export type AlarmInput = z.input<typeof AlarmSchema>;

const PermissionStateSchema = z.enum(['granted', 'denied', 'unknown']);

/** What the phone allows MyLife to do for alarms (reported with each request). */
export const AlarmPermissionsSchema = z
  .object({
    /** Android "Alarms & reminders" (`SCHEDULE_EXACT_ALARM`); iOS AlarmKit authorization. */
    exactAlarm: PermissionStateSchema,
    /** Android full-screen ringing screen; not applicable on iOS. */
    fullScreen: z.enum(['granted', 'denied', 'unknown', 'not_applicable']),
    notifications: PermissionStateSchema,
  })
  .strict();
export type AlarmPermissions = z.infer<typeof AlarmPermissionsSchema>;

/** `createAlarm` action. Without `sound` the phone uses `DEFAULT_ALARM_SOUND`; without `weekdays` it rings once. */
export const CreateAlarmArgsSchema = z
  .object({
    hour: HourSchema,
    minute: MinuteSchema,
    label: LabelSchema.optional(),
    sound: AlarmSoundIdSchema.optional(),
    weekdays: WeekdayListSchema.optional(),
  })
  .strict();
export type CreateAlarmArgs = z.infer<typeof CreateAlarmArgsSchema>;
export type CreateAlarmArgsInput = z.input<typeof CreateAlarmArgsSchema>;

/** `updateAlarm` action: only the fields that change. `label: null` removes the label. */
export const UpdateAlarmArgsSchema = z
  .object({
    alarmId: AlarmIdSchema,
    hour: HourSchema.optional(),
    minute: MinuteSchema.optional(),
    label: LabelSchema.nullable().optional(),
    sound: AlarmSoundIdSchema.optional(),
    weekdays: WeekdayListSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (args) =>
      args.hour !== undefined ||
      args.minute !== undefined ||
      args.label !== undefined ||
      args.sound !== undefined ||
      args.weekdays !== undefined ||
      args.enabled !== undefined,
    { message: 'At least one field to change is required' },
  );
export type UpdateAlarmArgs = z.infer<typeof UpdateAlarmArgsSchema>;
export type UpdateAlarmArgsInput = z.input<typeof UpdateAlarmArgsSchema>;

/** `deleteAlarm` action. */
export const DeleteAlarmArgsSchema = z.object({ alarmId: AlarmIdSchema }).strict();
export type DeleteAlarmArgs = z.infer<typeof DeleteAlarmArgsSchema>;
export type DeleteAlarmArgsInput = z.input<typeof DeleteAlarmArgsSchema>;

/** `previewAlarmSound` action: play the sound briefly in the app. */
export const PreviewAlarmSoundArgsSchema = z.object({ sound: AlarmSoundIdSchema }).strict();
export type PreviewAlarmSoundArgs = z.infer<typeof PreviewAlarmSoundArgsSchema>;
export type PreviewAlarmSoundArgsInput = z.input<typeof PreviewAlarmSoundArgsSchema>;

/** Snooze length used when the user does not say one ("snooze" → 9 minutes, like most clock apps). */
export const DEFAULT_SNOOZE_MINUTES = 9;
/** Longest snooze the phone accepts. */
export const SNOOZE_MINUTES_MAX = 30;

/** `stopAlarm` action: dismiss the alarm that is ringing now (`DeviceInfo.ringingAlarmId`). */
export const StopAlarmArgsSchema = z.object({ alarmId: AlarmIdSchema }).strict();
export type StopAlarmArgs = z.infer<typeof StopAlarmArgsSchema>;
export type StopAlarmArgsInput = z.input<typeof StopAlarmArgsSchema>;

/** `snoozeAlarm` action: silence the ringing alarm and ring again after `minutes`. */
export const SnoozeAlarmArgsSchema = z
  .object({
    alarmId: AlarmIdSchema,
    minutes: z.number().int().min(1).max(SNOOZE_MINUTES_MAX),
  })
  .strict();
export type SnoozeAlarmArgs = z.infer<typeof SnoozeAlarmArgsSchema>;
export type SnoozeAlarmArgsInput = z.input<typeof SnoozeAlarmArgsSchema>;
