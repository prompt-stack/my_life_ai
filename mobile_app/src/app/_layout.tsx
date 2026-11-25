import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { SessionProvider } from '@/lib/session';
import { ThemePreferenceProvider } from '@/lib/theme-preference';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const statusBarStyle = colorScheme === 'dark' ? 'light' : 'dark';

  return (
    <ThemePreferenceProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <SessionProvider>
          {/* Explicit styles: native screens own the iOS status bar and don't re-evaluate 'auto' on a live override. */}
          <StatusBar style={statusBarStyle} />
          <Stack screenOptions={{ headerShown: false, statusBarStyle }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="sign-in" options={{ presentation: 'modal' }} />
          </Stack>
        </SessionProvider>
      </ThemeProvider>
    </ThemePreferenceProvider>
  );
}
