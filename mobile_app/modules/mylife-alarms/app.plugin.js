/* global __dirname */
// Part of MyLife AI. The plugin structure (manifest permissions, Info.plist usage string, adding sound
// resources to the Xcode project) is adapted from react-native-alarm-scheduler v1.1.0, MIT License,
// Copyright (c) 2026 Raj Maurya. See LICENSE-react-native-alarm-scheduler and the README NOTICE.
const {
  AndroidConfig,
  IOSConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PKG = { name: 'mylife-alarms', version: '0.1.0' };
const SOUND_IDS = ['sunrise', 'chimes', 'marimba', 'piano', 'guitar'];
const ASSETS = path.join(__dirname, 'assets', 'sounds');

// The module's own AndroidManifest.xml declares the same permissions, receivers, service and
// activity (merged at build time); they are repeated here so `expo config --type prebuild` shows them.
const ANDROID_PERMISSIONS = [
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.WAKE_LOCK',
  'android.permission.VIBRATE',
];

const DEFAULT_USAGE =
  'MyLife AI uses alarms to wake you up and remind you at the times you choose.';

function withMyLifeAlarms(config, props = {}) {
  config = withAndroidManifest(config, (c) => {
    for (const permission of ANDROID_PERMISSIONS) {
      AndroidConfig.Permissions.ensurePermission(c.modResults, permission);
    }
    return c;
  });

  // Copy alarm_<id>.wav into the app's res/raw (referenced by name from the ringing service).
  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const rawDir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'raw');
      fs.mkdirSync(rawDir, { recursive: true });
      for (const id of SOUND_IDS) {
        const file = `alarm_${id}.wav`;
        const from = path.join(ASSETS, 'android', file);
        if (!fs.existsSync(from)) throw new Error(`[mylife-alarms] missing sound asset: ${from}`);
        fs.copyFileSync(from, path.join(rawDir, file));
      }
      return c;
    },
  ]);

  config = withInfoPlist(config, (c) => {
    c.modResults.NSAlarmKitUsageDescription = props.alarmKitUsageDescription || DEFAULT_USAGE;
    return c;
  });

  // Add <id>.caf to the main app bundle (AlarmKit loads `.named("<id>.caf")` from there).
  config = withXcodeProject(config, (c) => {
    const project = c.modResults;
    const { platformProjectRoot } = c.modRequest;
    IOSConfig.XcodeUtils.ensureGroupRecursively(project, 'Resources');
    for (const id of SOUND_IDS) {
      const abs = path.join(ASSETS, 'ios', `${id}.caf`);
      if (!fs.existsSync(abs)) throw new Error(`[mylife-alarms] missing sound asset: ${abs}`);
      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: path.relative(platformProjectRoot, abs),
        groupName: 'Resources',
        project,
        isBuildFile: true,
        verbose: false,
      });
    }
    return c;
  });

  return config;
}

module.exports = createRunOncePlugin(withMyLifeAlarms, PKG.name, PKG.version);
