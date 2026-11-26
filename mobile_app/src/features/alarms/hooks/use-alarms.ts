import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { addListener, isAvailable, listAlarms, type NativeAlarm } from '@/lib/native-alarms';

function sortByTime(alarms: NativeAlarm[]): NativeAlarm[] {
  return [...alarms].sort((a, b) => a.hour - b.hour || a.minute - b.minute);
}

/** The phone's own alarm list: reloads on focus and whenever the native side (or voice) changes it. */
export function useAlarms() {
  const [alarms, setAlarms] = useState<NativeAlarm[] | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAvailable()) {
      setAlarms([]);
      return;
    }
    try {
      setAlarms(sortByTime(await listAlarms()));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const subscription = addListener('onAlarmsChanged', () => void refresh());
    return () => subscription.remove();
  }, [refresh]);

  /** Optimistic local edit (e.g. a Switch); `refresh()` reconciles with the native state. */
  const replace = (alarm: NativeAlarm) =>
    setAlarms((current) => current?.map((item) => (item.id === alarm.id ? alarm : item)) ?? current);

  return { alarms, failed, loading: alarms === null && !failed, refresh, replace };
}
