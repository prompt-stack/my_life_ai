import { PreviewAlarmSoundArgsSchema } from '@mylife/shared';

import { PREVIEW_VOICE_MS, playAlarmPreview } from '@/features/alarms/alarm-preview';
import { isAvailable } from '@/lib/native-alarms';

import { INVALID_ARGS } from './alarm-result';
import type { DeviceToolHandler } from './types';

export const previewAlarmSoundTool: DeviceToolHandler = {
  name: 'previewAlarmSound',
  risk: 'read',
  platforms: ['android', 'ios'],
  isAvailable,
  async execute(args) {
    const parsed = PreviewAlarmSoundArgsSchema.safeParse(args);
    if (!parsed.success) return INVALID_ARGS;
    try {
      // Resolves after the preview stops, so the mic and TTS never overlap with it.
      await playAlarmPreview(parsed.data.sound, PREVIEW_VOICE_MS);
      return { ok: true, status: 'done' };
    } catch {
      return { ok: false, error: 'failed' };
    }
  },
};
