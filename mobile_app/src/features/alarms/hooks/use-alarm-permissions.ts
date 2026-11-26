import type { AlarmPermissions } from '@mylife/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { getPermissions, isAvailable } from '@/lib/native-alarms';

/** True when something alarms depend on is not granted yet (so the setup checklist is useful). */
export function permissionsNeedSetup(permissions: AlarmPermissions | null): boolean {
  if (!permissions || !isAvailable()) return false;
  if (Platform.OS === 'ios') return permissions.exactAlarm !== 'granted';
  return (
    permissions.exactAlarm === 'denied' ||
    permissions.notifications === 'denied' ||
    permissions.fullScreen === 'denied'
  );
}

/** Alarm permission statuses, re-read on focus and when the app returns from system settings. */
export function useAlarmPermissions() {
  const [permissions, setPermissions] = useState<AlarmPermissions | null>(null);

  const refresh = useCallback(async () => {
    if (!isAvailable()) {
      setPermissions(null);
      return;
    }
    try {
      setPermissions(await getPermissions());
    } catch {
      setPermissions(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return { permissions, refresh, needsSetup: permissionsNeedSetup(permissions) };
}
