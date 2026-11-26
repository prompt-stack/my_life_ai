import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  addListener,
  getRingingAlarmId,
  isAlarmErrorCode,
  listAlarms,
  snooze,
  stopRinging,
  type NativeAlarm,
} from '@/lib/native-alarms';

export type RingingAlarm = {
  id: string;
  /** Null when the alarm could not be read (e.g. it was deleted while ringing). */
  alarm: NativeAlarm | null;
};

async function describe(id: string): Promise<RingingAlarm> {
  try {
    const alarm = (await listAlarms()).find((item) => item.id === id) ?? null;
    return { id, alarm };
  } catch {
    return { id, alarm: null };
  }
}

/**
 * The alarm ringing right now while the app is in front, for the in-app ringing overlay.
 * Shown when an alarm fires with the app active, and when the app comes to the foreground while
 * an alarm still rings (e.g. the user tapped the notification or "Speak"). Hidden when it is dismissed.
 */
export function useRingingAlarm() {
  const [ringing, setRinging] = useState<RingingAlarm | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const show = async (id: string) => {
      const next = await describe(id);
      if (!cancelled) setRinging(next);
    };

    const syncWithNative = () => {
      getRingingAlarmId()
        .then((id) => {
          if (cancelled) return;
          if (id) void show(id);
          else setRinging(null);
        })
        .catch(() => {});
    };

    syncWithNative();

    const fired = addListener('onAlarmFired', (event) => {
      // `inApp === false`: Android launched the full-screen ringing screen instead.
      if (AppState.currentState === 'active' && event.inApp !== false) void show(event.id);
    });
    const dismissed = addListener('onAlarmDismissed', (event) => {
      setRinging((current) => (current && current.id === event.id ? null : current));
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') syncWithNative();
    });

    return () => {
      cancelled = true;
      fired.remove();
      dismissed.remove();
      appState.remove();
    };
  }, []);

  /** Runs a native action on the ringing alarm; the overlay closes once the alarm is gone. */
  const act = async (run: (id: string) => Promise<void>) => {
    if (!ringing || busy) return;
    setBusy(true);
    try {
      await run(ringing.id);
      setRinging(null);
    } catch (error) {
      // Already stopped elsewhere (notification, voice): nothing left to show.
      if (isAlarmErrorCode(error, 'ERR_NOT_FOUND')) setRinging(null);
    } finally {
      setBusy(false);
    }
  };

  return {
    ringing,
    busy,
    stop: () => act((id) => stopRinging(id)),
    snooze: () => act((id) => snooze(id)),
  };
}
