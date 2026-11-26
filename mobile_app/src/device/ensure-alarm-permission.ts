import type { DeviceToolResult } from '@mylife/shared';
import { Platform } from 'react-native';

import { getPermissions, requestAuthorization } from '@/lib/native-alarms';

/**
 * Checks the permission needed to schedule an enabled alarm. Returns a failure result to hand back
 * to the server, or null when scheduling may proceed. Android: "Alarms & reminders" must already
 * be granted (the user fixes it in the setup checklist). iOS: asks for AlarmKit access right here.
 */
export async function checkSchedulingPermission(): Promise<DeviceToolResult | null> {
  const permissions = await getPermissions();
  if (permissions.exactAlarm === 'granted') return null;
  if (Platform.OS === 'ios' && permissions.exactAlarm !== 'denied') {
    if ((await requestAuthorization()) === 'granted') return null;
  }
  return { ok: false, error: 'permission_required' };
}
