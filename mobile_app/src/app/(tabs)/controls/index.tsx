import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { MenuTile } from '@/components/menu-tile';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { Radius, Spacing } from '@/constants/theme';
import { CONTROLS, type ControlDefinition } from '@/features/controls/controls';

function chunkPairs(items: readonly ControlDefinition[]): ControlDefinition[][] {
  const rows: ControlDefinition[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

/** Menu of device controls. The list is bounded (7 tiles), so a ScrollView is fine. */
export default function ControlsMenuScreen() {
  const router = useRouter();
  const colors = useTheme();

  return (
    <ScrollView
      testID="controls-screen"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <ThemedView type="freeBadge" style={[styles.note, { borderColor: colors.border }]} testID="controls-free-note">
        <ThemedText type="smallBold" themeColor="onFreeBadge">
          Free, no account needed
        </ThemedText>
        <ThemedText type="small" themeColor="onFreeBadge">
          Control your phone&apos;s basic apps here, or just ask in Chat.
        </ThemedText>
      </ThemedView>
      {chunkPairs(CONTROLS).map((row) => (
        <View key={row[0].key} style={styles.row}>
          {row.map((control) => (
            <MenuTile
              key={control.key}
              title={control.title}
              subtitle={control.subtitle}
              symbol={control.symbol}
              badge={control.plan === 'free' ? 'Free' : 'Pro'}
              onPress={() => router.push(control.href)}
              testID={`control-tile-${control.key}`}
            />
          ))}
          {row.length === 1 ? <View style={styles.spacer} /> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.three },
  note: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: Radius.large, padding: Spacing.three, gap: Spacing.one },
  spacer: { flex: 1 },
});
