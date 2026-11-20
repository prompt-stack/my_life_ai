import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { PlanBadge } from '@/components/plan-badge';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import type { ControlSymbol } from '@/features/controls/controls';
import { useTheme } from '@/hooks/use-theme';

type MenuTileProps = {
  title: string;
  subtitle: string;
  symbol: ControlSymbol;
  /** Optional plan chip label, e.g. 'Free' or 'Pro'. */
  badge?: string;
  onPress: () => void;
  testID?: string;
};

export function MenuTile({ title, subtitle, symbol, badge, onPress, testID }: MenuTileProps) {
  const colors = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${title}, ${badge}, ${subtitle}` : `${title}, ${subtitle}`}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement,
          borderColor: colors.border,
        },
      ]}>
      <View style={styles.top}>
        <SymbolView name={symbol} size={28} tintColor={colors.primary} />
        {badge ? <PlanBadge label={badge} testID={`${testID}-free-badge`} /> : null}
      </View>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {subtitle}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tile: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth * 2,
    minHeight: MinTouchTarget * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
});
