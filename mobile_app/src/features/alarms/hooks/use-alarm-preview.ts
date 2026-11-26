import type { AlarmSoundId } from '@mylife/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { PREVIEW_PICKER_MS, playAlarmPreview, stopAlarmPreview } from '../alarm-preview';

/** Preview playback for the sound picker: one at a time, stopped on blur, unmount and backgrounding. */
export function useAlarmPreview() {
  const [playing, setPlaying] = useState<AlarmSoundId | null>(null);

  const play = async (id: AlarmSoundId) => {
    setPlaying(id);
    await playAlarmPreview(id, PREVIEW_PICKER_MS);
    // A newer preview may have taken over: only clear our own.
    setPlaying((current) => (current === id ? null : current));
  };

  useFocusEffect(useCallback(() => () => stopAlarmPreview(), []));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopAlarmPreview();
    });
    return () => {
      subscription.remove();
      stopAlarmPreview();
    };
  }, []);

  return { playing, play };
}
