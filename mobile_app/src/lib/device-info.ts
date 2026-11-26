import {
  ALARMS_MAX_IN_REQUEST,
  AlarmPermissionsSchema,
  type Alarm,
  type DeviceInfoInput,
} from '@mylife/shared';
import { Platform } from 'react-native';

import { getDeviceCapabilities } from '@/device';
import { toSharedAlarm } from '@/device/alarm-result';
import { getPermissions, getRingingAlarmId, isAvailable, listAlarms } from '@/lib/native-alarms';

const MAX_FIELD_LENGTH = 60;

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, MAX_FIELD_LENGTH);
  return trimmed || undefined;
}

/** Brand details (Android only), useful to the server for phone-specific advice. */
function getAndroidBrand(): Pick<DeviceInfoInput, 'manufacturer' | 'brand' | 'model'> {
  if (Platform.OS !== 'android') return {};
  const constants = Platform.constants;
  return {
    manufacturer: clean(constants.Manufacturer),
    brand: clean(constants.Brand),
    model: clean(constants.Model),
  };
}

/** Our alarms (soonest first, at most 30) and the permissions they depend on. Empty if unavailable. */
async function getAlarmInfo(): Promise<Pick<DeviceInfoInput, 'alarms' | 'alarmPermissions'>> {
  if (!isAvailable()) return {};
  try {
    const [native, permissions] = await Promise.all([listAlarms(), getPermissions()]);
    const alarms = native
      .map(toSharedAlarm)
      .filter((alarm): alarm is Alarm => alarm !== null)
      .sort((a, b) => (a.nextTriggerAt ?? '9999').localeCompare(b.nextTriggerAt ?? '9999'))
      .slice(0, ALARMS_MAX_IN_REQUEST);
    const parsed = AlarmPermissionsSchema.safeParse(permissions);
    return { alarms, ...(parsed.success ? { alarmPermissions: parsed.data } : {}) };
  } catch {
    return {};
  }
}

/** Id of the alarm ringing right now, if any (so the server can offer stop/snooze). */
async function getRingingInfo(): Promise<Pick<DeviceInfoInput, 'ringingAlarmId'>> {
  try {
    const id = await getRingingAlarmId();
    return id ? { ringingAlarmId: id } : {};
  } catch {
    return {};
  }
}

/** Platform, OS version, brand, available device tools and alarm state, sent with every voice request. */
export async function getDeviceInfo(): Promise<DeviceInfoInput> {
  const platform = Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web';
  return {
    platform,
    osVersion: String(Platform.Version),
    capabilities: getDeviceCapabilities(),
    ...getAndroidBrand(),
    ...(await getAlarmInfo()),
    ...(await getRingingInfo()),
  };
}
