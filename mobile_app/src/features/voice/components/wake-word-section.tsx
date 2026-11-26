import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { SecondaryButton } from '@/components/secondary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useWakeWord } from '@/features/voice/voice-provider';
import { ENABLE_FAILURE_TEXT, WAKE_STATUS_TEXT } from '@/features/voice/voice-types';
import { useTheme } from '@/hooks/use-theme';

/** Settings row: opt-in "Listen for 'AI'" switch with a live status line. */
export function WakeWordSection() {
  const { enabled, status, setEnabled, openSetup } = useWakeWord();
  const colors = useTheme();
  const [failure, setFailure] = useState<string | null>(null);

  const unavailable = status === 'simulator' || status === 'no_module';

  async function onChange(next: boolean) {
    setFailure(null);
    const result = await setEnabled(next);
    if (!result.ok) setFailure(ENABLE_FAILURE_TEXT[result.reason]);
  }

  return (
    <View style={styles.container} testID="wake-word-section">
      <View style={styles.row}>
        <View style={styles.label}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Voice
          </ThemedText>
          <ThemedText>Listen for “AI”</ThemedText>
        </View>
        <Switch
          value={enabled}
          onValueChange={onChange}
          disabled={unavailable}
          trackColor={{ true: colors.primary }}
          accessibilityLabel="Listen for AI"
          accessibilityHint="Say AI on any screen while MyLife is open to give a voice command"
          testID="settings-wake-word-switch"
        />
      </View>
      <ThemedText
        type="small"
        themeColor="textSecondary"
        accessibilityLiveRegion="polite"
        testID="wake-word-status"
      >
        {failure ?? WAKE_STATUS_TEXT[status]}
      </ThemedText>
      {status === 'needs_setup' ? (
        <SecondaryButton
          label="Download offline speech"
          onPress={openSetup}
          testID="wake-word-setup-button"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  label: { flex: 1 },
});
