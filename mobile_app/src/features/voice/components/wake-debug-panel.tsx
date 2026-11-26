import { ScrollView, StyleSheet, View } from 'react-native';

import { SecondaryButton } from '@/components/secondary-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { clearWakeDebug, useWakeDebug } from '@/features/voice/wake-debug-log';
import { useTheme } from '@/hooks/use-theme';

/** Keeps the panel from pushing the rest of Settings off screen. */
const LIST_MAX_HEIGHT = 240;

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** Development builds only: the last wake-mode transcripts, so what the phone hears for "AI" can be checked. */
export function WakeDebugPanel() {
  const { results, events } = useWakeDebug();
  const colors = useTheme();

  if (!__DEV__) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.backgroundElement,
          borderColor: colors.border,
        },
      ]}
      testID="wake-debug-panel"
    >
      <ThemedText type="smallBold" themeColor="textSecondary">
        What the mic heard (dev only, kept in memory)
      </ThemedText>
      <ScrollView style={styles.list} nestedScrollEnabled>
        {results.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary" testID="wake-debug-empty">
            Nothing yet. Turn on “Listen for AI” and say something.
          </ThemedText>
        ) : (
          results.map((result) => (
            <ThemedText
              key={result.id}
              type="small"
              themeColor={result.triggered ? 'speaking' : 'text'}
              testID={`wake-debug-row-${result.id}`}
            >
              {clock(result.at)} {result.isFinal ? 'final' : 'interim'}
              {result.triggered ? ' TRIGGERED' : ''}
              {'\n'}
              {result.alternatives.map((text) => `“${text}”`).join(' | ')}
            </ThemedText>
          ))
        )}
        {events.length > 0 ? (
          <View>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Recognizer
            </ThemedText>
            {events.map((event) => (
              <ThemedText key={event.id} type="small" themeColor="textSecondary">
                {clock(event.at)} {event.text}
              </ThemedText>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <SecondaryButton label="Clear" onPress={clearWakeDebug} testID="wake-debug-clear-button" />
    </View>
  );
}

const styles = StyleSheet.create({
  /** At most 15 transcripts + 10 recognizer lines: bounded, so a plain scroll view is fine. */
  list: { maxHeight: LIST_MAX_HEIGHT },
  container: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
