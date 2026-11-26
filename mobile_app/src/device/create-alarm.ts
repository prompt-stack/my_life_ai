import { CreateAlarmArgsSchema, DEFAULT_ALARM_SOUND } from '@mylife/shared';

import { createAlarm, isAvailable } from '@/lib/native-alarms';

import { INVALID_ARGS, doneResult, errorResult } from './alarm-result';
import { checkSchedulingPermission } from './ensure-alarm-permission';
import type { DeviceToolHandler } from './types';

export const createAlarmTool: DeviceToolHandler = {
  name: 'createAlarm',
  risk: 'write',
  platforms: ['android', 'ios'],
  isAvailable,
  async execute(args) {
    const parsed = CreateAlarmArgsSchema.safeParse(args);
    if (!parsed.success) return INVALID_ARGS;
    const { hour, minute, label, sound, weekdays } = parsed.data;
    const blocked = await checkSchedulingPermission();
    if (blocked) return blocked;
    try {
      const alarm = await createAlarm({
        hour,
        minute,
        weekdays: weekdays ?? [],
        label,
        sound: sound ?? DEFAULT_ALARM_SOUND,
        enabled: true,
      });
      return doneResult(alarm);
    } catch (error) {
      return errorResult(error);
    }
  },
};
