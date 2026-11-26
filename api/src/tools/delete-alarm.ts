import { DeleteAlarmArgsSchema } from '@mylife/shared';
import { z } from 'zod';
import { formatClockTime } from './alarm-format.js';
import { findAlarmMatch } from './alarm-matching.js';
import { ModelTimeSchema, timeParameter } from './alarm-model-params.js';
import { defineDeviceTool } from './types.js';

export const NO_ALARMS_REPLY = "You don't have any alarms yet.";

/** What the model may send: the alarm's time. The alarm ID is chosen by server code, never the model. */
export const DeleteAlarmModelArgsSchema = z.object({ target: ModelTimeSchema }).strict();

/**
 * Deletes a MyLife alarm. Server code resolves the spoken time against the
 * phone's alarm list: exact match acts, a near miss asks first. Risk `write`:
 * MyLife's own data (rule 9).
 */
export const deleteAlarmTool = defineDeviceTool({
  name: 'deleteAlarm',
  description: 'Delete a MyLife alarm. target is its time.',
  riskLevel: 'write',
  target: 'device',
  platforms: ['android', 'ios'],
  input: DeleteAlarmArgsSchema,
  modelInput: DeleteAlarmModelArgsSchema,
  parameters: {
    type: 'object',
    properties: { target: timeParameter() },
    required: ['target'],
    additionalProperties: false,
  },
  clarificationReply: 'Sorry, which alarm should I delete? Tell me its time.',
  resolve(args, { device }) {
    const match = findAlarmMatch(device?.alarms ?? [], args.target);
    if (match.kind === 'none') return { kind: 'reply', reply: NO_ALARMS_REPLY };
    if (match.kind === 'closest') {
      return { kind: 'reply', reply: `Your closest alarm is ${formatClockTime(match.alarm)}. Delete that one?` };
    }
    return { kind: 'action', args: { alarmId: match.alarm.id } };
  },
});
