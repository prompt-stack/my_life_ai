import { describe, expect, it } from 'vitest';
import { ALARM_TOOL_NAMES } from '../test-utils/alarms.js';
import { createAlarmTool } from './create-alarm.js';
import { createDeviceToolCatalog } from './device-catalog.js';
import { deviceTools } from './index.js';

describe('createDeviceToolCatalog', () => {
  const catalog = createDeviceToolCatalog(deviceTools);
  const names = (device: Parameters<typeof catalog.availableFor>[0]) => catalog.availableFor(device).map((tool) => tool.name);

  it('rejects duplicate tool names', () => {
    expect(() => createDeviceToolCatalog([createAlarmTool, createAlarmTool])).toThrow(/Duplicate device tool name/);
  });

  it('registers exactly the six alarm tools', () => {
    expect(catalog.list().map((tool) => tool.name)).toEqual(ALARM_TOOL_NAMES);
    expect(catalog.get('createAlarm')).toBe(createAlarmTool);
    expect(catalog.get('setAlarm')).toBeUndefined();
  });

  it.each(['android', 'ios'] as const)('offers every reported alarm tool on %s', (platform) => {
    expect(names({ platform, capabilities: [...ALARM_TOOL_NAMES] })).toEqual(ALARM_TOOL_NAMES);
  });

  it('offers stopAlarm but not snoozeAlarm to an iPhone that reports only stopAlarm', () => {
    const iphone = { platform: 'ios' as const, capabilities: ALARM_TOOL_NAMES.filter((name) => name !== 'snoozeAlarm') };
    expect(names(iphone)).toContain('stopAlarm');
    expect(names(iphone)).not.toContain('snoozeAlarm');
  });

  it('offers only the tools the phone reports', () => {
    expect(names({ platform: 'android', capabilities: ['createAlarm', 'previewAlarmSound'] })).toEqual([
      'createAlarm',
      'previewAlarmSound',
    ]);
  });

  it('still offers alarm tools when the exact alarm permission is denied (the phone reports permission_required)', () => {
    expect(
      names({
        platform: 'android',
        capabilities: [...ALARM_TOOL_NAMES],
        alarmPermissions: { exactAlarm: 'denied', fullScreen: 'denied', notifications: 'denied' },
      }),
    ).toEqual(ALARM_TOOL_NAMES);
  });

  it.each([
    ['no device info', undefined],
    ['web, even if it claims the capabilities', { platform: 'web' as const, capabilities: [...ALARM_TOOL_NAMES] }],
    ['Android without capabilities', { platform: 'android' as const, capabilities: [] }],
    ['an iPhone without capabilities (iOS < 26 or no module)', { platform: 'ios' as const, capabilities: [] }],
  ])('offers nothing for %s', (_label, device) => {
    expect(catalog.availableFor(device)).toEqual([]);
  });
});
