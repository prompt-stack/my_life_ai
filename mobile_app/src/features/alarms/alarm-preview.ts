import type { AlarmSoundId } from '@mylife/shared';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { ALARM_SOUND_ASSETS } from './alarm-sound-assets';

/** Preview volume (the alarm itself rings at alarm volume on the native side). */
export const PREVIEW_VOLUME = 0.7;
/** Preview length when the user taps a sound in the picker. */
export const PREVIEW_PICKER_MS = 6000;
/** Preview length for "play me the piano one" by voice. */
export const PREVIEW_VOICE_MS = 5000;

type Active = { player: AudioPlayer; finish: () => void };

// Single player: starting a preview always stops the previous one.
let active: Active | null = null;

export function stopAlarmPreview(): void {
  active?.finish();
}

/** Plays a bundled sound once and resolves when it has stopped (finished, timed out or interrupted). */
export async function playAlarmPreview(sound: AlarmSoundId, durationMs: number): Promise<void> {
  stopAlarmPreview();
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch {
    // Audio mode is best effort: playback still works with the defaults.
  }
  return new Promise<void>((resolve) => {
    const player = createAudioPlayer(ALARM_SOUND_ASSETS[sound]);
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let subscription: { remove: () => void } | undefined;

    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      subscription?.remove();
      try {
        player.pause();
        player.remove();
      } catch {
        // Already released.
      }
      if (active?.player === player) active = null;
      resolve();
    };

    active = { player, finish };
    subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finish();
    });
    timer = setTimeout(finish, durationMs);
    player.volume = PREVIEW_VOLUME;
    player.play();
  });
}
