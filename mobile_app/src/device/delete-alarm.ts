import { DeleteAlarmArgsSchema } from '@mylife/shared';

import { deleteAlarm, isAvailable } from '@/lib/native-alarms';

import { INVALID_ARGS, doneResult, errorResult } from './alarm-result';
import type { DeviceToolHandler } from './types';

export const deleteAlarmTool: DeviceToolHandler = {
  name: 'deleteAlarm',
  risk: 'write',
  platforms: ['android', 'ios'],
  isAvailable,
  async execute(args) {
    const parsed = DeleteAlarmArgsSchema.safeParse(args);
    if (!parsed.success) return INVALID_ARGS;
    try {
      await deleteAlarm(parsed.data.alarmId);
      return doneResult();
    } catch (error) {
      return errorResult(error);
    }
  },
};
