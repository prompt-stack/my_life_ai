import type { AlarmSoundId } from '@mylife/shared';

/** Bundled preview audio. Metro resolves the platform file: android here. */
export const ALARM_SOUND_ASSETS: Record<AlarmSoundId, number> = {
  sunrise: require('../../../modules/mylife-alarms/assets/sounds/android/alarm_sunrise.wav'),
  chimes: require('../../../modules/mylife-alarms/assets/sounds/android/alarm_chimes.wav'),
  marimba: require('../../../modules/mylife-alarms/assets/sounds/android/alarm_marimba.wav'),
  piano: require('../../../modules/mylife-alarms/assets/sounds/android/alarm_piano.wav'),
  guitar: require('../../../modules/mylife-alarms/assets/sounds/android/alarm_guitar.wav'),
};
