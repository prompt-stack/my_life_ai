import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { DAY_LETTERS, DAY_LONG } from '../alarm-format';

type Props = {
  /** ISO weekdays (1 = Monday ... 7 = Sunday). Empty means the alarm rings once. */
  value: number[];
  onChange: (days: number[]) => void;
};

export function DayChips({ value, onChange }: Props) {
  const colors = useTheme();

  const toggle = (day: number) =>
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort());

  return (
    <View style={styles.row} accessibilityLabel="Repeat on">
      {DAY_LETTERS.map((letter, index) => {
        const day = index + 1;
        const selected = value.includes(day);
        return (
          <Pressable
            key={day}
            accessibilityRole="checkbox"
            accessibilityLabel={DAY_LONG[index]}
            accessibilityState={{ checked: selected }}
            onPress={() => toggle(day)}
            testID={`alarm-day-${day}`}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: selected ? colors.primary : colors.backgroundElement,
                borderColor: selected ? colors.primary : colors.border,
              },
              pressed && styles.pressed,
            ]}>
            <ThemedText
              type="smallBold"
              style={{ color: selected ? colors.onPrimary : colors.text }}>
              {letter}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.one },
  chip: {
    flex: 1,
    minHeight: MinTouchTarget,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
});
