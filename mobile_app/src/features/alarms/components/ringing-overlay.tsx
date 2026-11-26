import { useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { SecondaryButton } from '@/components/secondary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatTime } from '@/features/alarms/alarm-format';
import { useRingingAlarm } from '@/features/alarms/hooks/use-ringing-alarm';
import { useVoice, useWakeWord } from '@/features/voice/voice-provider';
import { useTheme } from '@/hooks/use-theme';

const IS_ANDROID = Platform.OS === 'android';

/**
 * Full-screen overlay shown above the whole app while an alarm rings and the app is in front.
 * Stop and Snooze work by touch; with "Listen for AI" on, "AI, stop" / "AI, snooze" work too.
 * Snooze is Android only (AlarmKit has no snooze we can trigger).
 */
export function RingingOverlay() {
  const { ringing, busy, stop, snooze } = useRingingAlarm();
  const { state, statusText, startVoice } = useVoice();
  const { enabled: wakeEnabled } = useWakeWord();
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  const timeText = ringing?.alarm ? formatTime(ringing.alarm.hour, ringing.alarm.minute) : null;
  const label = ringing?.alarm?.label ?? 'Alarm';
  const visible = ringing !== null;

  // Screen readers get told once when it appears.
  useEffect(() => {
    if (visible)
      AccessibilityInfo.announceForAccessibility(
        `${label} ringing${timeText ? ` at ${timeText}` : ''}`,
      );
  }, [visible, label, timeText]);

  if (!ringing) return null;

  const voiceBusy = state !== 'idle' && state !== 'error';
  const hint = voiceBusy
    ? statusText
    : wakeEnabled && IS_ANDROID
      ? 'Say “AI, stop” or “AI, snooze”'
      : 'Tap Stop' + (IS_ANDROID ? ' or Snooze' : '');

  return (
    <Animated.View
      entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
      accessibilityViewIsModal
      style={[
        styles.overlay,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + Spacing.five,
          paddingBottom: insets.bottom + Spacing.four,
        },
      ]}
      testID="ringing-overlay"
    >
      <View style={styles.center}>
        <ThemedText type="subtitle" themeColor="textSecondary" accessibilityRole="header">
          {label}
        </ThemedText>
        {timeText ? (
          <ThemedText type="title" testID="ringing-time">
            {timeText}
          </ThemedText>
        ) : null}
        <ThemedText
          themeColor="textSecondary"
          style={styles.hint}
          accessibilityLiveRegion="polite"
          testID="ringing-hint"
        >
          {hint}
        </ThemedText>
      </View>
      <View style={styles.actions}>
        <PrimaryButton
          label="Stop"
          onPress={stop}
          disabled={busy}
          style={styles.big}
          accessibilityHint="Stops the alarm"
          testID="ringing-stop-button"
        />
        {IS_ANDROID ? (
          <SecondaryButton
            label="Snooze"
            onPress={snooze}
            disabled={busy}
            style={styles.big}
            accessibilityHint="Rings again in 9 minutes"
            testID="ringing-snooze-button"
          />
        ) : null}
        {!voiceBusy ? (
          <SecondaryButton
            label="Speak"
            onPress={startVoice}
            disabled={busy}
            accessibilityHint="Give a voice command, for example stop or snooze"
            testID="ringing-speak-button"
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    paddingHorizontal: Spacing.four,
    justifyContent: 'space-between',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  hint: { textAlign: 'center' },
  actions: { gap: Spacing.three },
  big: { paddingVertical: Spacing.four },
});
