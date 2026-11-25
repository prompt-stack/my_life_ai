import { requireOptionalNativeModule } from 'expo';

type IntentLauncherPackage = typeof import('expo-intent-launcher');

/**
 * Adapter for `expo-intent-launcher`. Importing it throws when its native module is missing
 * (Expo Go, or a dev build made before the package was added), so it is only required after
 * checking that the native module exists. The module is Android-only.
 */
function load(): IntentLauncherPackage | null {
  if (!requireOptionalNativeModule('ExpoIntentLauncher')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-intent-launcher') as IntentLauncherPackage;
  } catch {
    return null;
  }
}

/** The package, or `null` when this client lacks the native module. */
export const IntentLauncher = load();
