import { SnoozeAlarmArgsSchema } from '@mylife/shared';

import { isAvailable, snooze } from '@/lib/native-alarms';

import { INVALID_ARGS, doneResult, errorResult } from './alarm-result';
import type { DeviceToolHandler } from './types';

/** Acts only on the alarm that is ringing right now; the native side rejects any other id (not_found). */
export const snoozeAlarmTool: DeviceToolHandler = {
  name: 'snoozeAlarm',
  risk: 'write',
  platforms: ['android'],
  isAvailable,
  async execute(args) {
    const parsed = SnoozeAlarmArgsSchema.safeParse(args);
    if (!parsed.success) return INVALID_ARGS;
    try {
      await snooze(parsed.data.alarmId, parsed.data.minutes);
      return doneResult();
    } catch (error) {
      return errorResult(error);
    }
  },
};
