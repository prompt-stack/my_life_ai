import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { PlanBadge } from '@/components/plan-badge';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/constants/theme';

type ControlScreenProps = PropsWithChildren<{
  description: string;
  /** Label of the (disabled) primary action. Omit when the screen has no single action. */
  actionLabel?: string;
  /** Example sentence to say in Chat, shown without quotes. */
  chatHint: string;
  /** Platform limit from the CLAUDE.md "Device control" table. */
  platformNote?: string;
  /** Plan chip label shown near the top. */
  badge?: string;
  testID: string;
}>;

/** Shared layout for the Controls placeholder screens. The header comes from the stack. */
export function ControlScreen({
  description,
  actionLabel,
  chatHint,
  platformNote,
  badge = 'Free',
  testID,
  children,
}: ControlScreenProps) {
  const colors = useTheme();
  const cardStyle = [styles.card, { borderColor: colors.border }];
  return (
    <ScrollView
      testID={testID}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <PlanBadge label={badge} testID={`${testID}-free-badge`} />
      <ThemedText themeColor="textSecondary">{description}</ThemedText>

      {children}

      {actionLabel ? (
        <PrimaryButton label={actionLabel} disabled testID={`${testID}-action`} />
      ) : null}
      {actionLabel ? (
        <ThemedText type="small" themeColor="textSecondary">
          Coming in Phase 3
        </ThemedText>
      ) : null}

      <ThemedView type="backgroundElement" style={cardStyle} testID={`${testID}-chat-hint`}>
        <ThemedText type="small" themeColor="textSecondary">
          Or just ask in Chat: “{chatHint}”
        </ThemedText>
      </ThemedView>

      {platformNote ? (
        <ThemedView type="backgroundElement" style={cardStyle} testID={`${testID}-platform-note`}>
          <ThemedText type="smallBold">On iPhone</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {platformNote}
          </ThemedText>
        </ThemedView>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
