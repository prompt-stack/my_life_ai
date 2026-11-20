import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ControlScreen } from '@/components/control-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import type { ControlSymbol } from '@/features/controls/controls';
import { useTheme } from '@/hooks/use-theme';

const APP_SHORTCUTS: readonly { name: string; symbol: ControlSymbol }[] = [
  { name: 'Maps', symbol: { ios: 'map', android: 'map' } },
  { name: 'Mail', symbol: { ios: 'envelope', android: 'mail' } },
  { name: 'Camera', symbol: { ios: 'camera', android: 'photo_camera' } },
  { name: 'Settings', symbol: { ios: 'gearshape', android: 'settings' } },
];

export default function AppsScreen() {
  const colors = useTheme();

  return (
    <ControlScreen
      testID="apps-screen"
      description="Open other apps on your phone."
      chatHint="Open Maps"
      platformNote="MyLife AI can open apps, but it cannot control what you do inside them.">
      {APP_SHORTCUTS.map(({ name, symbol }) => (
        <ThemedView
          key={name}
          type="backgroundElement"
          style={styles.row}
          testID={`app-shortcut-${name.toLowerCase()}`}>
          <View style={styles.label}>
            <SymbolView name={symbol} size={22} tintColor={colors.textSecondary} />
            <ThemedText themeColor="textSecondary">{name}</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Coming in Phase 3
          </ThemedText>
        </ThemedView>
      ))}
    </ControlScreen>
  );
}

const styles = StyleSheet.create({
  label: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  row: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    opacity: 0.6,
  },
});
