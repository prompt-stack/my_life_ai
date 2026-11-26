import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Radius } from '@/constants/theme';
import type { VoiceState } from '@/features/voice/voice-types';
import { useTheme } from '@/hooks/use-theme';

const SIZE = 28;
const PULSE_MS: Record<VoiceState, number> = {
  idle: 0,
  listening: 700,
  thinking: 1100,
  speaking: 900,
  error: 0,
};

type Props = { state: VoiceState };

/** Compact, lighter variant of the voice orb for the floating indicator: one pulsing dot. */
export function VoiceMiniOrb({ state }: Props) {
  const colors = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const duration = PULSE_MS[state];

  useEffect(() => {
    cancelAnimation(pulse);
    if (!duration || reduceMotion) {
      pulse.value = withTiming(0, { duration: 150 });
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [duration, reduceMotion, pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.8, 1]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.85, 1.1]) }],
  }));

  const color =
    state === 'error' ? colors.danger : state === 'speaking' ? colors.speaking : colors.primary;

  return <Animated.View style={[styles.orb, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  orb: { width: SIZE, height: SIZE, borderRadius: Radius.pill },
});
