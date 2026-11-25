import type { DeviceInfoInput } from '@mylife/shared';
import { Platform } from 'react-native';

import { getDeviceCapabilities } from '@/device';

/** Platform, OS version and device tools available now, sent with every voice request. */
export function getDeviceInfo(): DeviceInfoInput {
  const platform = Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web';
  return {
    platform,
    osVersion: String(Platform.Version),
    capabilities: getDeviceCapabilities(),
  };
}
