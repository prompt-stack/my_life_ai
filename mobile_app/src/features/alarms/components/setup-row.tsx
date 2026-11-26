import { StyleSheet, View } from 'react-native';

import { SecondaryButton } from '@/components/secondary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  title: string;
  description: string;
  /** Omit for recommendations that have no readable status (battery, autostart). */
  status?: 'granted' | 'denied' | 'unknown';
  actionLabel: string;
  onAction: () => void;
  testID: string;
};

const STATUS_TEXT = { granted: 'Allowed', denied: 'Not allowed', unknown: 'Not set' } as const;

export function SetupRow({ title, description, status, actionLabel, onAction, testID }: Props) {
  const colors = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: colors.border }]} testID={testID}>
      <View style={styles.top}>
        <ThemedText type="smallBold" style={styles.title}>
          {title}
        </ThemedText>
        {status ? (
          <ThemedText
            type="small"
            themeColor={status === 'granted' ? 'speaking' : 'textSecondary'}
            testID={`${testID}-status`}>
            {STATUS_TEXT[status]}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {description}
      </ThemedText>
      {status === 'granted' ? null : (
        <SecondaryButton label={actionLabel} onPress={onAction} testID={`${testID}-button`} />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  title: { flexShrink: 1 },
});
