import { UpdateAlarmArgsSchema, type Alarm, type AlarmSoundId, type AlarmTime, type UpdateAlarmArgs } from '@mylife/shared';
import { z } from 'zod';
import { alarmSoundName, formatClockTime, normalizeWeekdays, sameWeekdays } from './alarm-format.js';
import { findAlarmMatch } from './alarm-matching.js';
import {
  hourParameter,
  labelParameter,
  minuteParameter,
  ModelHourSchema,
  ModelLabelSchema,
  ModelMinuteSchema,
  ModelSoundSchema,
  ModelTimeSchema,
  ModelWeekdaysSchema,
  resolveModelSound,
  SOUND_QUESTION,
  soundParameter,
  timeParameter,
  weekdaysParameter,
} from './alarm-model-params.js';
import { NO_ALARMS_REPLY } from './delete-alarm.js';
import { defineDeviceTool, type DeviceToolResolution } from './types.js';

export const ALREADY_SET_REPLY = 'That alarm is already set that way.';

/** What the model may send: the alarm's current time plus what changes. The alarm ID is server-only. */
export const UpdateAlarmModelArgsSchema = z
  .object({
    target: ModelTimeSchema,
    newHour: ModelHourSchema.optional(),
    newMinute: ModelMinuteSchema.optional(),
    label: ModelLabelSchema.optional(),
    sound: ModelSoundSchema.optional(),
    weekdays: ModelWeekdaysSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
type UpdateAlarmModelArgs = z.infer<typeof UpdateAlarmModelArgsSchema>;

/**
 * The requested new time, if any. "Move it to 7" usually comes as newHour only,
 * meaning 7:00; a lone newMinute keeps the alarm's hour.
 */
function requestedTime(args: UpdateAlarmModelArgs, alarm: Alarm): AlarmTime | undefined {
  if (args.newHour !== undefined) return { hour: args.newHour, minute: args.newMinute ?? 0 };
  if (args.newMinute !== undefined) return { hour: alarm.hour, minute: args.newMinute };
  return undefined;
}

function hasRequestedChange(args: UpdateAlarmModelArgs): boolean {
  return (
    args.newHour !== undefined ||
    args.newMinute !== undefined ||
    args.label !== undefined ||
    args.sound !== undefined ||
    args.weekdays !== undefined ||
    args.enabled !== undefined
  );
}

/** "Change that one to 7:00 AM?", "Turn that one off?". */
function confirmQuestion(args: UpdateAlarmModelArgs, alarm: Alarm, sound: AlarmSoundId | undefined): string {
  const time = requestedTime(args, alarm);
  if (time) return `Change that one to ${formatClockTime(time)}?`;
  if (sound) return `Change that one to ${alarmSoundName(sound)}?`;
  if (args.enabled === false) return 'Turn that one off?';
  if (args.enabled === true) return 'Turn that one on?';
  return 'Change that one?';
}

/** Only the fields that differ from the alarm as the phone reported it. */
function changedFields(args: UpdateAlarmModelArgs, alarm: Alarm, sound: AlarmSoundId | undefined): UpdateAlarmArgs {
  const update: UpdateAlarmArgs = { alarmId: alarm.id };
  const time = requestedTime(args, alarm);
  const timeChanges = time !== undefined && (time.hour !== alarm.hour || time.minute !== alarm.minute);
  if (timeChanges) {
    update.hour = time.hour;
    update.minute = time.minute;
  }
  if (args.label !== undefined && args.label !== alarm.label) update.label = args.label;
  if (sound !== undefined && sound !== alarm.sound) update.sound = sound;
  if (args.weekdays !== undefined && !sameWeekdays(args.weekdays, alarm.weekdays)) {
    update.weekdays = normalizeWeekdays(args.weekdays);
  }
  // Moving an alarm that is off almost always means "I want it again", so turn it on unless told otherwise.
  const enabled = args.enabled ?? (timeChanges && !alarm.enabled ? true : undefined);
  if (enabled !== undefined && enabled !== alarm.enabled) update.enabled = enabled;
  return update;
}

function onlyAlarmId(update: UpdateAlarmArgs): boolean {
  return Object.keys(update).length === 1;
}

/**
 * Changes a MyLife alarm: time, label, sound, repeat days, or on/off. Server
 * code resolves `target` against the phone's alarm list (exact acts, a near miss
 * asks first) and sends only the fields that change. Risk `write` (rule 9).
 */
export const updateAlarmTool = defineDeviceTool({
  name: 'updateAlarm',
  description: 'Change a MyLife alarm. target is its current time; pass only what changes.',
  riskLevel: 'write',
  target: 'device',
  platforms: ['android', 'ios'],
  input: UpdateAlarmArgsSchema,
  modelInput: UpdateAlarmModelArgsSchema,
  parameters: {
    type: 'object',
    properties: {
      target: timeParameter(),
      newHour: hourParameter(),
      newMinute: minuteParameter(),
      label: labelParameter,
      sound: soundParameter(true),
      weekdays: weekdaysParameter,
      enabled: { type: 'boolean' },
    },
    required: ['target'],
    additionalProperties: false,
  },
  clarificationReply: 'Sorry, which alarm should I change, and how?',
  resolve(args, { device }): DeviceToolResolution {
    const sound = resolveModelSound(args.sound);
    if (sound.kind === 'unknown') return { kind: 'reply', reply: SOUND_QUESTION };
    const newSound = sound.kind === 'sound' ? sound.sound : undefined;

    const match = findAlarmMatch(device?.alarms ?? [], args.target);
    if (match.kind === 'none') return { kind: 'reply', reply: NO_ALARMS_REPLY };

    const time = formatClockTime(match.alarm);
    if (!hasRequestedChange(args)) {
      return { kind: 'reply', reply: `What would you like to change about your ${time} alarm?` };
    }
    if (match.kind === 'closest') {
      return { kind: 'reply', reply: `Your closest alarm is ${time}. ${confirmQuestion(args, match.alarm, newSound)}` };
    }

    const update = changedFields(args, match.alarm, newSound);
    if (onlyAlarmId(update)) return { kind: 'reply', reply: ALREADY_SET_REPLY };
    return { kind: 'action', args: update };
  },
});
