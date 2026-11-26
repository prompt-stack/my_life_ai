import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { SecondaryButton } from '@/components/secondary-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useWakeWord } from '@/features/voice/voice-provider';
import { ENABLE_FAILURE_TEXT } from '@/features/voice/voice-types';
import { useTheme } from '@/hooks/use-theme';

function Card({ children, testID }: { children: ReactNode; testID: string }) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.backgroundElement,
          borderColor: colors.border,
        },
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

/**
 * One-time cards on the Assistant screen: first the offer to turn on "AI" listening, and, if the
 * device lacks offline speech recognition, a one-time setup message (never network fallback).
 */
export function WakeWordPrompt() {
  const {
    enabled,
    status,
    promptDismissed,
    setupDismissed,
    setEnabled,
    dismissPrompt,
    dismissSetup,
    openSetup,
  } = useWakeWord();
  const [failure, setFailure] = useState<string | null>(null);

  if (enabled && status === 'needs_setup' && !setupDismissed) {
    return (
      <Card testID="wake-word-setup-card">
        <ThemedText type="smallBold">
          Download offline speech recognition for your language to use “AI”
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          “AI” listening stays on your phone, so it needs the offline model.
        </ThemedText>
        <View style={styles.actions}>
          <SecondaryButton
            label="Not now"
            onPress={dismissSetup}
            testID="wake-word-setup-dismiss-button"
          />
          <PrimaryButton
            label="Download"
            onPress={openSetup}
            testID="wake-word-setup-card-button"
          />
        </View>
      </Card>
    );
  }

  if (enabled || promptDismissed) return null;

  async function onEnable() {
    setFailure(null);
    const result = await setEnabled(true);
    if (!result.ok) setFailure(ENABLE_FAILURE_TEXT[result.reason]);
  }

  return (
    <Card testID="wake-word-prompt">
      <ThemedText type="smallBold">Say “AI” from any screen to talk to MyLife. Turn on?</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Listens on your phone only while MyLife is open.
      </ThemedText>
      {failure ? (
        <ThemedText type="small" accessibilityLiveRegion="polite" testID="wake-word-prompt-error">
          {failure}
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        <SecondaryButton
          label="Not now"
          onPress={dismissPrompt}
          testID="wake-word-dismiss-button"
        />
        <PrimaryButton label="Turn on" onPress={onEnable} testID="wake-word-enable-button" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
});
