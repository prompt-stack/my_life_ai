import { useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { VoiceMiniOrb } from '@/features/voice/components/voice-mini-orb';
import { useVoice } from '@/features/voice/voice-provider';
import type { VoiceState } from '@/features/voice/voice-types';
import { useTheme } from '@/hooks/use-theme';

const ANNOUNCEMENT: Record<VoiceState, string> = {
  idle: '',
  listening: 'MyLife is listening',
  thinking: 'MyLife is thinking',
  speaking: 'MyLife is speaking',
  error: '',
};

/**
 * Floating pill at the bottom, above the tab bar, on every screen except the Assistant tab (where the orb shows the
 * state). Only the pill itself takes touches; the rest of the overlay lets touches through.
 */
export function VoiceIndicator() {
  const { state, statusText, cancel } = useVoice();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const onAssistant = segments.includes('assistant');
  const inTabs = segments.includes('(tabs)');

  // Remember where the turn started (adjusting state during render, no effect needed).
  const [prevState, setPrevState] = useState(state);
  const [startedOnAssistant, setStartedOnAssistant] = useState(onAssistant);
  if (state !== prevState) {
    setPrevState(state);
    if (prevState === 'idle') setStartedOnAssistant(onAssistant);
  }

  // Errors from turns started on the Assistant stay on the Assistant (its status line shows them).
  const visible = state !== 'idle' && !onAssistant && (state !== 'error' || !startedOnAssistant);

  // iOS has no live regions: announce state changes explicitly while the pill is showing.
  useEffect(() => {
    if (visible && ANNOUNCEMENT[state])
      AccessibilityInfo.announceForAccessibility(ANNOUNCEMENT[state]);
  }, [visible, state]);

  if (!visible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.overlay,
        {
          paddingBottom: insets.bottom + (inTabs ? BottomTabInset : 0) + Spacing.three,
        },
      ]}
      testID="voice-indicator-overlay"
    >
      <Animated.View
        entering={FadeInDown.duration(200).reduceMotion(ReduceMotion.System)}
        exiting={FadeOutDown.duration(150).reduceMotion(ReduceMotion.System)}
        style={[
          styles.pill,
          {
            backgroundColor: colors.backgroundElement,
            borderColor: colors.border,
          },
        ]}
        accessibilityLiveRegion="polite"
        testID="voice-indicator"
      >
        <VoiceMiniOrb state={state} />
        <ThemedText
          type="smallBold"
          style={styles.status}
          numberOfLines={2}
          accessibilityLabel={ANNOUNCEMENT[state] || statusText}
          testID="voice-indicator-status"
        >
          {statusText.replace(' tap to stop', '')}
        </ThemedText>
        <Pressable
          onPress={cancel}
          accessibilityRole="button"
          accessibilityLabel={state === 'error' ? 'Dismiss' : 'Cancel voice request'}
          hitSlop={Spacing.one}
          style={({ pressed }) => [
            styles.cancel,
            {
              backgroundColor: pressed ? colors.backgroundSelected : 'transparent',
            },
          ]}
          testID="voice-indicator-cancel"
        >
          <ThemedText type="smallBold" themeColor="textSecondary">
            {state === 'error' ? 'Dismiss' : 'Cancel'}
          </ThemedText>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: '100%',
    minHeight: MinTouchTarget,
    paddingVertical: Spacing.one,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  status: { flexShrink: 1 },
  cancel: {
    minHeight: MinTouchTarget - Spacing.two,
    minWidth: MinTouchTarget,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
