import type { AlarmSoundId } from '@mylife/shared';

/** Bundled preview audio. Metro resolves the platform file: ios here. */
export const ALARM_SOUND_ASSETS: Record<AlarmSoundId, number> = {
  sunrise: require('../../../modules/mylife-alarms/assets/sounds/ios/sunrise.caf'),
  chimes: require('../../../modules/mylife-alarms/assets/sounds/ios/chimes.caf'),
  marimba: require('../../../modules/mylife-alarms/assets/sounds/ios/marimba.caf'),
  piano: require('../../../modules/mylife-alarms/assets/sounds/ios/piano.caf'),
  guitar: require('../../../modules/mylife-alarms/assets/sounds/ios/guitar.caf'),
};
