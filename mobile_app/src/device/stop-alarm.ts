import { StopAlarmArgsSchema } from '@mylife/shared';

import { isAvailable, stopRinging } from '@/lib/native-alarms';

import { INVALID_ARGS, doneResult, errorResult } from './alarm-result';
import type { DeviceToolHandler } from './types';

/** Acts only on the alarm that is ringing right now; the native side rejects any other id (not_found). */
export const stopAlarmTool: DeviceToolHandler = {
  name: 'stopAlarm',
  risk: 'write',
  platforms: ['android', 'ios'],
  isAvailable,
  async execute(args) {
    const parsed = StopAlarmArgsSchema.safeParse(args);
    if (!parsed.success) return INVALID_ARGS;
    try {
      await stopRinging(parsed.data.alarmId);
      return doneResult();
    } catch (error) {
      return errorResult(error);
    }
  },
};
