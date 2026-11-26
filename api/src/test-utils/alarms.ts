import type { Alarm, DeviceInfo, DeviceToolName } from '@mylife/shared';

/** Alarm tools offered whenever the phone reports them. */
export const IDLE_ALARM_TOOL_NAMES: DeviceToolName[] = ['createAlarm', 'updateAlarm', 'deleteAlarm', 'previewAlarmSound'];
/** Offered only while an alarm rings (`DeviceInfo.ringingAlarmId`). */
export const RINGING_ALARM_TOOL_NAMES: DeviceToolName[] = ['stopAlarm', 'snoozeAlarm'];
/** Every alarm tool an Android phone reports (iOS reports all but snoozeAlarm). */
export const ALARM_TOOL_NAMES: DeviceToolName[] = [...IDLE_ALARM_TOOL_NAMES, ...RINGING_ALARM_TOOL_NAMES];

/** A valid alarm for tests; override what the test is about. */
export function testAlarm(overrides: Partial<Alarm> = {}): Alarm {
  return {
    id: 'alarm-1',
    hour: 6,
    minute: 30,
    weekdays: [],
    sound: 'sunrise',
    enabled: true,
    nextTriggerAt: '2026-01-02T22:30:00.000Z',
    ...overrides,
  };
}

/** Weekday wake-up alarm at 6:30 AM (Manila), labeled, default sound. */
export const WAKE = testAlarm({ id: 'alarm-1', weekdays: [1, 2, 3, 4, 5], label: 'Wake up' });
/** One-time 9 PM alarm with Piano that is off. */
export const EVENING = testAlarm({ id: 'alarm-2', hour: 21, minute: 0, sound: 'piano', enabled: false, nextTriggerAt: null });

/** An Android phone with every alarm tool and the given alarms (nothing ringing unless overridden). */
export function androidWithAlarms(alarms: Alarm[] = [WAKE, EVENING], overrides: Partial<DeviceInfo> = {}): DeviceInfo {
  return { platform: 'android', capabilities: [...ALARM_TOOL_NAMES], alarms, ...overrides };
}
