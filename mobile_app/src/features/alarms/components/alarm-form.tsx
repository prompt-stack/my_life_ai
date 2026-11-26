import { ALARM_LABEL_MAX_LENGTH, DEFAULT_ALARM_SOUND } from '@mylife/shared';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { SecondaryButton } from '@/components/secondary-button';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createAlarm,
  deleteAlarm,
  isAlarmErrorCode,
  updateAlarm,
  type NativeAlarm,
} from '@/lib/native-alarms';

import { repeatSummary, soundName } from '../alarm-format';
import { setDraftSound, useDraftSound } from '../alarm-draft-sound';
import { ALARM_SETUP_HREF, ALARM_SOUND_HREF } from '../routes';
import { DayChips } from './day-chips';
import { TimePicker } from './time-picker';

type Props = {
  /** The alarm being edited; undefined creates a new one. */
  initial: NativeAlarm | undefined;
};

/** Create / edit form. Presentational pieces are components; saving talks to the native module. */
export function AlarmForm({ initial }: Props) {
  const colors = useTheme();
  const router = useRouter();
  const [hour, setHour] = useState(initial?.hour ?? 7);
  const [minute, setMinute] = useState(initial?.minute ?? 0);
  const [label, setLabel] = useState(initial?.label ?? '');
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? []);
  const [saving, setSaving] = useState(false);
  const sound = useDraftSound();

  // The sound picker is its own route, so the chosen sound lives in a tiny shared draft.
  // Keyed on the id only: a list refresh must not reset a sound the user just picked.
  useEffect(() => {
    setDraftSound(initial?.sound ?? DEFAULT_ALARM_SOUND);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  const onError = (error: unknown) => {
    if (isAlarmErrorCode(error, 'ERR_PERMISSION_REQUIRED')) {
      Alert.alert('Permission needed', 'Alarms need a few permissions before they can ring.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open setup', onPress: () => router.push(ALARM_SETUP_HREF) },
      ]);
    } else if (isAlarmErrorCode(error, 'ERR_NOT_FOUND')) {
      Alert.alert('This alarm no longer exists');
      router.back();
    } else {
      Alert.alert('Could not save the alarm', 'Please try again.');
    }
  };

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const trimmed = label.trim();
      if (initial) {
        await updateAlarm(initial.id, {
          hour,
          minute,
          weekdays,
          sound,
          label: trimmed || null,
          // Saving a disabled alarm after editing it is a clear intent to use it.
          enabled: true,
        });
      } else {
        await createAlarm({ hour, minute, weekdays, sound, label: trimmed || undefined, enabled: true });
      }
      router.back();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!initial) return;
    Alert.alert('Delete this alarm?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAlarm(initial.id);
            router.back();
          } catch (error) {
            onError(error);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      testID="alarm-edit-screen"
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: initial ? 'Edit alarm' : 'New alarm' }} />
      <TimePicker hour={hour} minute={minute} onChange={(t) => { setHour(t.hour); setMinute(t.minute); }} />

      <View style={styles.section}>
        <ThemedText type="smallBold">Label</ThemedText>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="Alarm"
          placeholderTextColor={colors.textSecondary}
          maxLength={ALARM_LABEL_MAX_LENGTH}
          returnKeyType="done"
          accessibilityLabel="Label"
          testID="alarm-label-input"
          style={[styles.input, { color: colors.text, backgroundColor: colors.backgroundElement, borderColor: colors.border }]}
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="smallBold">Repeat</ThemedText>
        <DayChips value={weekdays} onChange={setWeekdays} />
        <ThemedText type="small" themeColor="textSecondary">
          {repeatSummary(weekdays)}
        </ThemedText>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sound, ${soundName(sound)}`}
        onPress={() => router.push(ALARM_SOUND_HREF)}
        testID="alarm-sound-row"
        style={({ pressed }) => [
          styles.soundRow,
          { backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement, borderColor: colors.border },
        ]}>
        <ThemedText type="smallBold">Sound</ThemedText>
        <ThemedText themeColor="textSecondary">{soundName(sound)}</ThemedText>
      </Pressable>

      <PrimaryButton label="Save" onPress={() => void onSave()} disabled={saving} testID="alarm-save-button" />
      <SecondaryButton label="Cancel" onPress={() => router.back()} testID="alarm-cancel-button" />
      {initial ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete alarm"
          onPress={onDelete}
          testID="alarm-delete-button"
          style={styles.delete}>
          <ThemedText style={{ color: colors.danger, fontWeight: 600 }}>Delete alarm</ThemedText>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.four },
  section: { gap: Spacing.two },
  input: {
    minHeight: MinTouchTarget,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  soundRow: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  delete: { minHeight: MinTouchTarget, alignItems: 'center', justifyContent: 'center' },
});
