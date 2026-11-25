import { requireOptionalNativeModule } from 'expo';

type SpeechRecognitionPackage = typeof import('expo-speech-recognition');

/**
 * Adapter for `expo-speech-recognition`. The package throws at import time when its native module
 * is missing (Expo Go, or a dev build made before the package was added), so it is only
 * required after checking that the native module exists.
 */
function load(): SpeechRecognitionPackage | null {
  if (!requireOptionalNativeModule('ExpoSpeechRecognition')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-speech-recognition') as SpeechRecognitionPackage;
  } catch {
    return null;
  }
}

const speechRecognition = load();

export const isSpeechRecognitionAvailable = speechRecognition !== null;

/** The native module, or `null` when this client lacks it. */
export const SpeechRecognitionModule = speechRecognition?.ExpoSpeechRecognitionModule ?? null;

const noopEventHook: SpeechRecognitionPackage['useSpeechRecognitionEvent'] = () => {};

/** Same signature as the package hook; a no-op when unavailable (availability never changes at runtime). */
export const useSpeechRecognitionEvent: SpeechRecognitionPackage['useSpeechRecognitionEvent'] =
  speechRecognition?.useSpeechRecognitionEvent ?? noopEventHook;
