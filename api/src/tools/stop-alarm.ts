import { StopAlarmArgsSchema } from '@mylife/shared';
import { z } from 'zod';
import { defineDeviceTool } from './types.js';

/** Spoken when stop or snooze is asked for but the phone reports no ringing alarm. */
export const NO_RINGING_ALARM_REPLY = "There's no alarm ringing right now.";

/** True when the phone reports an alarm ringing right now. */
export function isAlarmRinging(device: { ringingAlarmId?: string | undefined } | undefined): boolean {
  return Boolean(device?.ringingAlarmId);
}

/** The model sends nothing: which alarm rings is the phone's report, never the model's guess. */
export const StopAlarmModelArgsSchema = z.object({}).strict();

/**
 * Stops (dismisses) the MyLife alarm ringing now. Offered only while one rings.
 * Risk `write`: MyLife's own alarm on the user's phone, contacts nobody (rule 9).
 */
export const stopAlarmTool = defineDeviceTool({
  name: 'stopAlarm',
  description: 'Stop the alarm that is ringing now.',
  riskLevel: 'write',
  target: 'device',
  platforms: ['android', 'ios'],
  input: StopAlarmArgsSchema,
  modelInput: StopAlarmModelArgsSchema,
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  clarificationReply: 'Sorry, should I stop the alarm?',
  offerOnlyWhen: isAlarmRinging,
  resolve(_args, { device }) {
    const alarmId = device?.ringingAlarmId;
    if (!alarmId) return { kind: 'reply', reply: NO_RINGING_ALARM_REPLY };
    return { kind: 'action', args: { alarmId } };
  },
});
