import Storage from 'expo-sqlite/kv-store';

const ENABLED_KEY = 'voice.wakeWordEnabled';
const PROMPT_DISMISSED_KEY = 'voice.wakeWordPromptDismissed';
const SETUP_DISMISSED_KEY = 'voice.wakeWordSetupDismissed';

function readFlag(key: string): boolean {
  try {
    return Storage.getItemSync(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    Storage.setItemSync(key, value ? '1' : '0');
  } catch {
    // Ignore: the choice still applies for this session.
  }
}

/** Persisted flags for the "Listen for 'AI'" feature. Read synchronously; failures fall back to false (off). */
export const wakeWordPreference = {
  readEnabled: () => readFlag(ENABLED_KEY),
  writeEnabled: (value: boolean) => writeFlag(ENABLED_KEY, value),
  readPromptDismissed: () => readFlag(PROMPT_DISMISSED_KEY),
  writePromptDismissed: (value: boolean) => writeFlag(PROMPT_DISMISSED_KEY, value),
  readSetupDismissed: () => readFlag(SETUP_DISMISSED_KEY),
  writeSetupDismissed: (value: boolean) => writeFlag(SETUP_DISMISSED_KEY, value),
};
