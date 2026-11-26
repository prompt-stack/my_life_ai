import { DEFAULT_ALARM_SOUND, type AlarmSoundId } from '@mylife/shared';
import { useSyncExternalStore } from 'react';

/**
 * The sound chosen while editing an alarm. Shared by the edit screen and the sound picker, which
 * is a separate route. Tiny UI-only state, reset by the edit screen when it opens.
 */
let draft: AlarmSoundId = DEFAULT_ALARM_SOUND;
const listeners = new Set<() => void>();

export function setDraftSound(sound: AlarmSoundId): void {
  if (draft === sound) return;
  draft = sound;
  listeners.forEach((listener) => listener());
}

export function useDraftSound(): AlarmSoundId {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => draft,
  );
}
