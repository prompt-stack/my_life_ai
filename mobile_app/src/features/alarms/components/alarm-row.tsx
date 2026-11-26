import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NativeAlarm } from '@/lib/native-alarms';

import { formatTime, repeatSummary, soundName } from '../alarm-format';

type Props = {
  alarm: NativeAlarm;
  onPress: () => void;
  onToggle: (enabled: boolean) => void;
};

export function AlarmRow({ alarm, onPress, onToggle }: Props) {
  const colors = useTheme();
  const time = formatTime(alarm.hour, alarm.minute);
  const details = [alarm.label, repeatSummary(alarm.weekdays), soundName(alarm.sound)]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      style={[styles.row, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${time}, ${details}, ${alarm.enabled ? 'on' : 'off'}`}
        accessibilityHint="Opens the alarm to edit"
        onPress={onPress}
        testID={`alarm-row-${alarm.id}`}
        style={({ pressed }) => [styles.main, pressed && { backgroundColor: colors.backgroundSelected }]}>
        <ThemedText
          type="subtitle"
          themeColor={alarm.enabled ? 'text' : 'textSecondary'}
          style={styles.time}>
          {time}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {details}
        </ThemedText>
      </Pressable>
      <Switch
        value={alarm.enabled}
        onValueChange={onToggle}
        accessibilityLabel={`${time} alarm`}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.onPrimary}
        testID={`alarm-switch-${alarm.id}`}
        style={styles.switch}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    overflow: 'hidden',
    minHeight: MinTouchTarget * 2,
  },
  main: { flex: 1, padding: Spacing.three, gap: Spacing.half },
  time: { fontSize: 32, lineHeight: 40 },
  switch: { marginRight: Spacing.three },
});
