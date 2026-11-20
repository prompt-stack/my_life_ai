import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';

type PlanBadgeProps = {
  label: string;
  testID?: string;
};

/** Small non-interactive chip, e.g. "Free" or "Pro". */
export function PlanBadge({ label, testID }: PlanBadgeProps) {
  return (
    <ThemedView type="freeBadge" style={styles.chip} testID={testID}>
      <ThemedText type="small" themeColor="onFreeBadge" style={styles.label}>
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  label: { fontWeight: 600 },
});
