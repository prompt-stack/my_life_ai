import type { DeviceAction, DeviceToolName, DeviceToolResult } from '@mylife/shared';
import { Platform } from 'react-native';

import { setAlarm } from './set-alarm';
import type { DeviceToolHandler } from './types';

const registry: Record<DeviceToolName, DeviceToolHandler> = {
  setAlarm,
};

function currentPlatform(): 'android' | 'ios' | null {
  return Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : null;
}

/** Tools this phone can run right now (platform supported and native pieces present). */
export function getDeviceCapabilities(): DeviceToolName[] {
  const platform = currentPlatform();
  if (!platform) return [];
  return (Object.values(registry) as DeviceToolHandler[])
    .filter((tool) => tool.platforms.includes(platform) && tool.isAvailable())
    .map((tool) => tool.name);
}

/** Runs an allowlisted device tool. Never throws: every failure becomes a result. */
export async function executeDeviceAction(action: DeviceAction): Promise<DeviceToolResult> {
  const handler = (registry as Partial<Record<string, DeviceToolHandler>>)[action.name];
  if (!handler) return { ok: false, error: 'failed', message: 'Unknown device tool' };
  try {
    return await handler.execute(action.args);
  } catch {
    return { ok: false, error: 'failed', message: 'Device action failed' };
  }
}
