import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VoiceOrb } from '@/components/voice-orb';
import { Spacing } from '@/constants/theme';
import { useVoiceConversation } from '@/hooks/use-voice-conversation';

/** Voice-only assistant. The app has no text chat: the user speaks to the agent. */
export default function AssistantScreen() {
  const { state, statusText, onOrbPress } = useVoiceConversation();

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
            Try “Set an alarm for 6 AM”
          </ThemedText>
        </View>
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
