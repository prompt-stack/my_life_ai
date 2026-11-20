import { StyleSheet, View } from 'react-native';

import { ControlScreen } from '@/components/control-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const PREVIEW_LEVEL = 0.6;

export default function BrightnessScreen() {
  const colors = useTheme();

  return (
    <ControlScreen
      testID="brightness-screen"
      description="Adjust how bright the screen is."
      chatHint="Make the screen brighter">
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Brightness preview</ThemedText>
        <View
          style={[styles.track, { backgroundColor: colors.backgroundSelected }]}
          accessibilityLabel="Brightness slider preview, not active yet"
          accessibilityRole="adjustable">
          <View
            style={[
              styles.fill,
              { width: `${PREVIEW_LEVEL * 100}%`, backgroundColor: colors.textSecondary },
            ]}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Coming in Phase 3
        </ThemedText>
      </ThemedView>
    </ControlScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.large, padding: Spacing.three, gap: Spacing.two },
  track: { height: Spacing.three, borderRadius: Radius.medium, overflow: 'hidden' },
  fill: { height: '100%' },
});
