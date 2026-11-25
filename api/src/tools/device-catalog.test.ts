import { describe, expect, it } from 'vitest';
import { createDeviceToolCatalog } from './device-catalog.js';
import { deviceTools } from './index.js';
import { setAlarmTool } from './set-alarm.js';

describe('createDeviceToolCatalog', () => {
  const catalog = createDeviceToolCatalog(deviceTools);

  it('rejects duplicate tool names', () => {
    expect(() => createDeviceToolCatalog([setAlarmTool, setAlarmTool])).toThrow(/Duplicate device tool name/);
  });

  it('lists and looks up registered tools', () => {
    expect(catalog.list().map((tool) => tool.name)).toContain('setAlarm');
    expect(catalog.get('setAlarm')).toBe(setAlarmTool);
    expect(catalog.get('rootPhone')).toBeUndefined();
  });

  it('offers setAlarm to an Android phone that reports the capability', () => {
    expect(catalog.availableFor({ platform: 'android', capabilities: ['setAlarm'] })).toEqual([setAlarmTool]);
  });

  it.each([
    ['no device info', undefined],
    ['an iPhone, even if it claims the capability', { platform: 'ios' as const, capabilities: ['setAlarm' as const] }],
    ['web', { platform: 'web' as const, capabilities: ['setAlarm' as const] }],
    ['Android without the capability', { platform: 'android' as const, capabilities: [] }],
  ])('offers nothing for %s', (_label, device) => {
    expect(catalog.availableFor(device)).toEqual([]);
  });
});
