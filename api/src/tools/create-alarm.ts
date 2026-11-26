import { CreateAlarmArgsSchema, type CreateAlarmArgs } from '@mylife/shared';
import { z } from 'zod';
import { formatClockTime, normalizeWeekdays, sameWeekdays } from './alarm-format.js';
import {
  hourParameter,
  labelParameter,
  minuteParameter,
  ModelHourSchema,
  ModelLabelSchema,
  ModelMinuteSchema,
  ModelSoundSchema,
  ModelWeekdaysSchema,
  resolveModelSound,
  SOUND_QUESTION,
  soundParameter,
  weekdaysParameter,
} from './alarm-model-params.js';
import { defineDeviceTool } from './types.js';

/** What the model may send. */
export const CreateAlarmModelArgsSchema = z
  .object({
    hour: ModelHourSchema,
    minute: ModelMinuteSchema,
    label: ModelLabelSchema.optional(),
    sound: ModelSoundSchema.optional(),
    weekdays: ModelWeekdaysSchema.optional(),
  })
  .strict();

/**
 * Creates a MyLife alarm. The phone's native module schedules, stores and rings
 * it (CLAUDE.md rule 3 exception). Risk `write`: MyLife's own data on the
 * user's phone, contacts nobody, so no on-device confirmation (rule 9).
 */
export const createAlarmTool = defineDeviceTool({
  name: 'createAlarm',
  description: 'Create a MyLife alarm. Only when the time is complete, including AM or PM.',
  riskLevel: 'write',
  target: 'device',
  platforms: ['android', 'ios'],
  input: CreateAlarmArgsSchema,
  modelInput: CreateAlarmModelArgsSchema,
  parameters: {
    type: 'object',
    properties: {
      hour: hourParameter('24-hour (6 PM is 18).'),
      minute: minuteParameter(),
      label: labelParameter,
      sound: soundParameter(true),
      weekdays: weekdaysParameter,
    },
    required: ['hour', 'minute'],
    additionalProperties: false,
  },
  clarificationReply: 'Sorry, what time should I set the alarm for?',
  resolve(args, { device }) {
    const sound = resolveModelSound(args.sound);
    if (sound.kind === 'unknown') return { kind: 'reply', reply: SOUND_QUESTION };

    const weekdays = normalizeWeekdays(args.weekdays ?? []);
    const duplicate = (device?.alarms ?? []).find(
      (alarm) =>
        alarm.enabled && alarm.hour === args.hour && alarm.minute === args.minute && sameWeekdays(alarm.weekdays, weekdays),
    );
    if (duplicate) {
      return { kind: 'reply', reply: `You already have an alarm at ${formatClockTime(duplicate)}.` };
    }

    // Sound left out on purpose when not named: the phone applies DEFAULT_ALARM_SOUND.
    const action: CreateAlarmArgs = {
      hour: args.hour,
      minute: args.minute,
      ...(args.label ? { label: args.label } : {}),
      ...(sound.kind === 'sound' ? { sound: sound.sound } : {}),
      ...(weekdays.length > 0 ? { weekdays } : {}),
    };
    return { kind: 'action', args: action };
  },
});
