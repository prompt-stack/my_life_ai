import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VoiceOrb } from '@/components/voice-orb';
import { Spacing } from '@/constants/theme';
import { AlarmSetupBanner } from '@/features/alarms/components/setup-banner';
import { WakeWordPrompt } from '@/features/voice/components/wake-word-prompt';
import { useVoice } from '@/features/voice/voice-provider';

/** Voice-only assistant. The app has no text chat: the user speaks to the agent. */
export default function AssistantScreen() {
  const { state, statusText, onOrbPress, startVoice, permissionRequired } = useVoice();
  const router = useRouter();
  // `?voice=1` comes from the alarm's "Speak" button: the user is present, so start listening once.
  const { voice, t } = useLocalSearchParams<{ voice?: string; t?: string }>();

  useEffect(() => {
    if (voice !== '1') return;
    startVoice();
    router.setParams({ voice: undefined, t: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice, t]);

  return (
    <ThemedView style={styles.container} testID="assistant-screen">
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <VoiceOrb state={state} onPress={onOrbPress} />
          <ThemedText
            type="subtitle"
            style={styles.centered}
            accessibilityLiveRegion="polite"
            testID="voice-status">
            {statusText}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centered}>
            Try “Set an alarm for 6 AM with the piano sound”
          </ThemedText>
        </View>
        <WakeWordPrompt />
        {permissionRequired ? <AlarmSetupBanner testID="alarm-permission-banner" /> : null}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.four },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  centered: { textAlign: 'center' },
});
