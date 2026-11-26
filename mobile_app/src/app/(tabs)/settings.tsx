import { useRouter } from 'expo-router';

import { PrimaryButton } from '@/components/primary-button';
import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { SecondaryButton } from '@/components/secondary-button';
import { ThemedText } from '@/components/themed-text';
import { AppearanceSection } from '@/features/settings/appearance-section';
import { WakeDebugPanel } from '@/features/voice/components/wake-debug-panel';
import { WakeWordSection } from '@/features/voice/components/wake-word-section';
import { config } from '@/lib/config';
import { useSession } from '@/lib/session';

/** TODO: profile, timezone (default Asia/Manila), memories, integrations. */
export default function SettingsScreen() {
  const router = useRouter();
  const { status, signOut } = useSession();

  return (
    <ScreenPlaceholder
      title="Settings"
      description="Profile, memories and integrations will live here."
      testID="settings-screen">
      <AppearanceSection />
      <WakeWordSection />
      {__DEV__ ? <WakeDebugPanel /> : null}
      <ThemedText testID="account-status">
        {status === 'signedIn' ? 'Signed in (Pro)' : 'Guest'}
      </ThemedText>
      {status === 'signedIn' ? (
        <SecondaryButton label="Sign out" onPress={signOut} testID="sign-out-button" />
      ) : (
        <PrimaryButton
          label="Sign in for Pro"
          onPress={() => router.push('/sign-in')}
          testID="open-sign-in-button"
        />
      )}
      <ThemedText type="small" themeColor="textSecondary" testID="api-url">
        API: {config.apiUrl}
      </ThemedText>
    </ScreenPlaceholder>
  );
}
