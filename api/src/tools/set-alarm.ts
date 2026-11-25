import { SetAlarmArgsSchema } from '@mylife/shared';
import { defineDeviceTool } from './types.js';

/**
 * Sets an alarm in the phone's Clock app (Android `AlarmClock.ACTION_SET_ALARM`).
 * iOS apps cannot set Clock alarms, so the tool is Android only (see CLAUDE.md
 * "Device control"). Risk `write`: it changes the user's own phone and contacts
 * nobody, so no on-device confirmation is needed (rule 9).
 */
export const setAlarmTool = defineDeviceTool({
  name: 'setAlarm',
  description:
    "Set an alarm in the phone's Clock app for the next time this clock time comes around (today or tomorrow). " +
    'Only call it when the time is complete and unambiguous, including AM or PM. ' +
    'Pass the hour in 24-hour form. Cannot set repeating alarms or alarms for a specific date.',
  riskLevel: 'write',
  target: 'device',
  platforms: ['android'],
  input: SetAlarmArgsSchema,
  parameters: {
    type: 'object',
    properties: {
      hour: { type: 'integer', minimum: 0, maximum: 23, description: 'Hour in 24-hour time, 0 to 23 (6 PM is 18).' },
      minute: { type: 'integer', minimum: 0, maximum: 59, description: 'Minute, 0 to 59.' },
      label: {
        type: 'string',
        minLength: 1,
        maxLength: 60,
        description: 'Optional short label from the user, e.g. "Wake up" or "Take medicine".',
      },
    },
    required: ['hour', 'minute'],
    additionalProperties: false,
  },
  clarificationReply: 'Sorry, what time should I set the alarm for?',
});
