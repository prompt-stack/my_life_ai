import { DEFAULT_SNOOZE_MINUTES, SNOOZE_MINUTES_MAX, SnoozeAlarmArgsSchema, type SnoozeAlarmArgs } from '@mylife/shared';
import { z } from 'zod';
import { isAlarmRinging, NO_RINGING_ALARM_REPLY } from './stop-alarm.js';
import { defineDeviceTool } from './types.js';

/** What the model may send: only the snooze length, and only if the user said one. */
export const SnoozeAlarmModelArgsSchema = z
  .object({ minutes: z.number().int().min(1).max(SNOOZE_MINUTES_MAX).optional() })
  .strict();

/** Number words a person may use for a snooze length (1 to 30, plus "a minute" and "half an hour"). */
const NUMBER_WORDS = [
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
  'thirty', 'a minute', 'half an hour', 'half hour',
];
const SPOKEN_NUMBER = new RegExp(`\\d|\\b(${NUMBER_WORDS.join('|')})\\b`, 'i');

/** True when the user's words contain a number, so a snooze length from the model was actually said. */
export function mentionsSnoozeLength(text: string): boolean {
  return SPOKEN_NUMBER.test(text);
}

/**
 * The snooze length to use. gpt-oss sometimes invents one for a bare "Snooze"
 * (live: 5 instead of the default 9), so the model's minutes are kept only when
 * the user's words contain a number. Without a transcript, the validated model
 * value is used.
 */
export function snoozeMinutes(modelMinutes: number | undefined, userText: string | undefined): number {
  if (modelMinutes === undefined) return DEFAULT_SNOOZE_MINUTES;
  if (userText !== undefined && !mentionsSnoozeLength(userText)) return DEFAULT_SNOOZE_MINUTES;
  return modelMinutes;
}

/**
 * Snoozes the MyLife alarm ringing now. Offered only while one rings, and only
 * to phones that report it (iOS reports stopAlarm only). Risk `write`.
 */
export const snoozeAlarmTool = defineDeviceTool({
  name: 'snoozeAlarm',
  description: 'Snooze the ringing alarm.',
  riskLevel: 'write',
  target: 'device',
  platforms: ['android', 'ios'],
  input: SnoozeAlarmArgsSchema,
  modelInput: SnoozeAlarmModelArgsSchema,
  parameters: {
    type: 'object',
    properties: { minutes: { type: 'integer', minimum: 1, maximum: SNOOZE_MINUTES_MAX } },
    additionalProperties: false,
  },
  clarificationReply: `How many minutes should I snooze it, up to ${SNOOZE_MINUTES_MAX}?`,
  offerOnlyWhen: isAlarmRinging,
  resolve(args, { device, userText }) {
    const alarmId = device?.ringingAlarmId;
    if (!alarmId) return { kind: 'reply', reply: NO_RINGING_ALARM_REPLY };
    const action: SnoozeAlarmArgs = { alarmId, minutes: snoozeMinutes(args.minutes, userText) };
    return { kind: 'action', args: action };
  },
});
