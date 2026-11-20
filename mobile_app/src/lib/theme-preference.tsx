import { createContext, useContext, useState, type PropsWithChildren } from 'react';
import { Appearance } from 'react-native';
import Storage from 'expo-sqlite/kv-store';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'settings.themePreference';

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** Small storage adapter: failures never break the app, the preference just falls back to 'system'. */
const preferenceStorage = {
  read(): ThemePreference {
    try {
      const value = Storage.getItemSync(STORAGE_KEY);
      return isThemePreference(value) ? value : 'system';
    } catch {
      return 'system';
    }
  },
  write(preference: ThemePreference) {
    try {
      Storage.setItemSync(STORAGE_KEY, preference);
    } catch {
      // Ignore: the choice still applies for this session.
    }
  },
};

function applyColorScheme(preference: ThemePreference) {
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

type ThemePreferenceContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null);

/**
 * Holds the user's appearance choice and applies it with `Appearance.setColorScheme`,
 * which overrides `useColorScheme()` app-wide and the native chrome (tabs, headers, modals).
 * 'unspecified' removes the override so the app follows the OS again.
 * The saved value is read synchronously and applied before the first render to avoid a flash.
 */
export function ThemePreferenceProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const saved = preferenceStorage.read();
    if (saved !== 'system') applyColorScheme(saved);
    return saved;
  });

  function setPreference(next: ThemePreference) {
    applyColorScheme(next);
    preferenceStorage.write(next);
    setPreferenceState(next);
  }

  return (
    <ThemePreferenceContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  const value = useContext(ThemePreferenceContext);
  if (!value) {
    throw new Error('useThemePreference must be used inside ThemePreferenceProvider');
  }
  return value;
}
