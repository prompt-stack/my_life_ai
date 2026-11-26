import { UpdateAlarmArgsSchema } from '@mylife/shared';

import { isAvailable, updateAlarm, type UpdateAlarmChanges } from '@/lib/native-alarms';

import { INVALID_ARGS, doneResult, errorResult } from './alarm-result';
import { checkSchedulingPermission } from './ensure-alarm-permission';
import type { DeviceToolHandler } from './types';

export const updateAlarmTool: DeviceToolHandler = {
  name: 'updateAlarm',
  risk: 'write',
  platforms: ['android', 'ios'],
  isAvailable,
  async execute(args) {
    const parsed = UpdateAlarmArgsSchema.safeParse(args);
    if (!parsed.success) return INVALID_ARGS;
    const { alarmId, ...changes } = parsed.data;
    // Only keys the server sent are applied (an absent key is not the same as `label: null`).
    const nativeChanges: UpdateAlarmChanges = {};
    for (const [key, value] of Object.entries(changes)) {
      if (value !== undefined) Object.assign(nativeChanges, { [key]: value });
    }
    // Turning an alarm off or editing a disabled one needs no scheduling permission.
    if (changes.enabled !== false) {
      const blocked = await checkSchedulingPermission();
      if (blocked) return blocked;
    }
    try {
      return doneResult(await updateAlarm(alarmId, nativeChanges));
    } catch (error) {
      return errorResult(error);
    }
  },
};
