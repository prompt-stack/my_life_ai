import { ALARM_SOUNDS, DEFAULT_ALARM_SOUND } from '@mylife/shared';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PlanBadge } from '@/components/plan-badge';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { setDraftSound, useDraftSound } from '@/features/alarms/alarm-draft-sound';
import { useAlarmPreview } from '@/features/alarms/hooks/use-alarm-preview';
import { useTheme } from '@/hooks/use-theme';

export default function AlarmSoundScreen() {
  const colors = useTheme();
  const selected = useDraftSound();
  const { playing, play } = useAlarmPreview();

  return (
    <ScrollView
      testID="alarm-sound-screen"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Alarm sound" style={styles.group}>
        {ALARM_SOUNDS.map((sound) => {
          const isSelected = sound.id === selected;
          return (
            <Pressable
              key={sound.id}
              accessibilityRole="radio"
              accessibilityLabel={sound.name}
              accessibilityHint="Selects this sound and plays a short preview"
              accessibilityState={{ checked: isSelected }}
              onPress={() => {
                setDraftSound(sound.id);
                void play(sound.id);
              }}
              testID={`alarm-sound-row-${sound.id}`}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}>
              <View style={styles.name}>
                <ThemedText type="smallBold">{sound.name}</ThemedText>
                {sound.id === DEFAULT_ALARM_SOUND ? <PlanBadge label="Default" /> : null}
                {playing === sound.id ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Playing…
                  </ThemedText>
                ) : null}
              </View>
              {isSelected ? (
                <View testID={`alarm-sound-check-${sound.id}`}>
                  <SymbolView name={{ ios: 'checkmark', android: 'check' }} size={22} tintColor={colors.primary} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Preview uses media volume. Your alarm rings at alarm volume.
      </ThemedText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three },
  group: { gap: Spacing.two },
  row: {
    minHeight: MinTouchTarget + Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    paddingHorizontal: Spacing.three,
  },
  name: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexShrink: 1 },
});
