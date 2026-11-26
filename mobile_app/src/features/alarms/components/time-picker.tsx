import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { to12Hour, to24Hour } from '../alarm-format';

type Props = {
  hour: number;
  minute: number;
  onChange: (time: { hour: number; minute: number }) => void;
};

type StepperProps = {
  label: string;
  value: string;
  onUp: () => void;
  onDown: () => void;
  testID: string;
};

function Stepper({ label, value, onUp, onDown, testID }: StepperProps) {
  const colors = useTheme();
  const arrow = (direction: 'up' | 'down') => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${direction === 'up' ? 'Increase' : 'Decrease'} ${label}`}
      onPress={direction === 'up' ? onUp : onDown}
      testID={`${testID}-${direction}`}
      style={({ pressed }) => [styles.arrow, pressed && { backgroundColor: colors.backgroundSelected }]}>
      <SymbolView
        name={
          direction === 'up'
            ? { ios: 'chevron.up', android: 'keyboard_arrow_up' }
            : { ios: 'chevron.down', android: 'keyboard_arrow_down' }
        }
        size={24}
        tintColor={colors.primary}
      />
    </Pressable>
  );
  return (
    <View style={styles.stepper}>
      {arrow('up')}
      <ThemedText
        type="title"
        accessibilityLabel={`${label} ${value}`}
        accessibilityRole="adjustable"
        testID={testID}
        style={styles.value}>
        {value}
      </ThemedText>
      {arrow('down')}
    </View>
  );
}

const QUICK_MINUTES = [0, 15, 30, 45] as const;

/** Simple hour / minute / AM-PM picker built from steppers (no date-picker dependency). */
export function TimePicker({ hour, minute, onChange }: Props) {
  const colors = useTheme();
  const { hour: hour12, pm } = to12Hour(hour);

  return (
    <View style={styles.container}>
      <View style={styles.main}>
        <Stepper
          label="hour"
          value={String(hour12)}
          testID="alarm-time-hour"
          onUp={() => onChange({ hour: to24Hour((hour12 % 12) + 1, pm), minute })}
          onDown={() => onChange({ hour: to24Hour(((hour12 + 10) % 12) + 1, pm), minute })}
        />
        <ThemedText type="title">:</ThemedText>
        <Stepper
          label="minute"
          value={String(minute).padStart(2, '0')}
          testID="alarm-time-minute"
          onUp={() => onChange({ hour, minute: (minute + 1) % 60 })}
          onDown={() => onChange({ hour, minute: (minute + 59) % 60 })}
        />
        <View testID="alarm-time-ampm" style={styles.ampm}>
          <SegmentedControl
            accessibilityLabel="AM or PM"
            value={pm ? 'pm' : 'am'}
            onChange={(next) => onChange({ hour: to24Hour(hour12, next === 'pm'), minute })}
            options={[
              { value: 'am', label: 'AM', testID: 'alarm-time-ampm-am' },
              { value: 'pm', label: 'PM', testID: 'alarm-time-ampm-pm' },
            ]}
          />
        </View>
      </View>
      <View style={styles.quick}>
        {QUICK_MINUTES.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`Set minutes to ${value}`}
            onPress={() => onChange({ hour, minute: value })}
            testID={`alarm-time-minute-${value}`}
            style={({ pressed }) => [
              styles.quickChip,
              {
                backgroundColor: minute === value ? colors.backgroundSelected : colors.backgroundElement,
                borderColor: colors.border,
              },
              pressed && { opacity: 0.8 },
            ]}>
            <ThemedText type="small">{`:${String(value).padStart(2, '0')}`}</ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three, alignItems: 'center' },
  main: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepper: { alignItems: 'center' },
  arrow: {
    width: MinTouchTarget + Spacing.three,
    minHeight: MinTouchTarget,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { minWidth: 72, textAlign: 'center', fontVariant: ['tabular-nums'] },
  ampm: { marginLeft: Spacing.two, minWidth: 110 },
  quick: { flexDirection: 'row', gap: Spacing.two },
  quickChip: {
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget + Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
