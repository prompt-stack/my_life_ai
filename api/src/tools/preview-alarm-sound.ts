import { PreviewAlarmSoundArgsSchema } from '@mylife/shared';
import { z } from 'zod';
import { ModelSoundSchema, resolveModelSound, SOUND_QUESTION, soundParameter } from './alarm-model-params.js';
import { defineDeviceTool } from './types.js';

/** What the model may send: a sound name, normalized in code. */
export const PreviewAlarmSoundModelArgsSchema = z.object({ sound: ModelSoundSchema }).strict();

/** Plays an alarm sound briefly in the app. Risk `read`: no data changes. */
export const previewAlarmSoundTool = defineDeviceTool({
  name: 'previewAlarmSound',
  description: 'Play a short preview of an alarm sound.',
  riskLevel: 'read',
  target: 'device',
  platforms: ['android', 'ios'],
  input: PreviewAlarmSoundArgsSchema,
  modelInput: PreviewAlarmSoundModelArgsSchema,
  parameters: {
    type: 'object',
    properties: { sound: soundParameter(false) },
    required: ['sound'],
    additionalProperties: false,
  },
  clarificationReply: SOUND_QUESTION,
  resolve(args) {
    const sound = resolveModelSound(args.sound);
    if (sound.kind !== 'sound') return { kind: 'reply', reply: SOUND_QUESTION };
    return { kind: 'action', args: { sound: sound.sound } };
  },
});
