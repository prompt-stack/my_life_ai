import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { MinTouchTarget, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { VoiceState } from '@/hooks/use-voice-conversation';

const CORE_SIZE = 140;
const RING_COUNT = 3;
const RING_DURATION = 2400;
const BAR_COUNT = 5;
const BAR_HEIGHT = 36;
const BAR_WIDTH = 6;
const STATIC_BAR_SCALES = [0.4, 0.7, 1, 0.7, 0.4];

type VoiceOrbProps = {
  state: VoiceState;
  onPress: () => void;
};

const ORB_LABEL: Record<VoiceState, string> = {
  idle: 'Start listening',
  listening: 'Stop listening',
  thinking: 'Cancel',
  speaking: 'Stop speaking',
  error: 'Try again',
};

const DOT_COUNT = 3;
const ORBIT_RADIUS = 30;
const ORBIT_DURATION = 1800;
const DOT_SIZE = 12;

type ListeningProps = { listening: boolean; reduceMotion: boolean };

/** Expanding, fading ring. Resting state is fully transparent. */
function PulseRing({ listening, reduceMotion, delay }: ListeningProps & { delay: number }) {
  const colors = useTheme();
  const progress = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(progress);
    if (listening && !reduceMotion) {
      progress.value = 0;
      progress.value = withDelay(
        delay,
        withRepeat(withTiming(1, { duration: RING_DURATION, easing: Easing.out(Easing.quad) }), -1),
      );
    } else {
      progress.value = withTiming(1, { duration: 150 });
    }
    return () => cancelAnimation(progress);
  }, [listening, reduceMotion, delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: (1 - progress.value) * 0.5,
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 2.1]) }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, { borderColor: colors.primary, backgroundColor: colors.primary }, style]}
    />
  );
}

function WaveBar({
  index,
  reduceMotion,
  gentle = false,
  color,
}: {
  index: number;
  reduceMotion: boolean;
  gentle?: boolean;
  color: string;
}) {
  const scale = useSharedValue(STATIC_BAR_SCALES[index]);

  useEffect(() => {
    cancelAnimation(scale);
    if (reduceMotion) {
      scale.value = STATIC_BAR_SCALES[index];
      return;
    }
    const peak = gentle ? 0.7 : 1;
    const half = gentle ? 800 : 420;
    scale.value = 0.3;
    scale.value = withDelay(
      index * (gentle ? 200 : 120),
      withRepeat(
        withSequence(
          withTiming(peak, { duration: half, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.3, { duration: half, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(scale);
  }, [index, reduceMotion, gentle, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));

  return <Animated.View style={[styles.bar, { backgroundColor: color }, style]} />;
}

/** Three dots orbiting the centre while the AI is thinking. Static triangle with reduced motion. */
function ThinkingDots({ reduceMotion }: { reduceMotion: boolean }) {
  const colors = useTheme();
  const angle = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(angle);
    if (reduceMotion) {
      angle.value = 0;
      return;
    }
    angle.value = withRepeat(withTiming(360, { duration: ORBIT_DURATION, easing: Easing.linear }), -1);
    return () => cancelAnimation(angle);
  }, [reduceMotion, angle]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));

  return (
    <Animated.View style={[styles.orbit, style]}>
      {Array.from({ length: DOT_COUNT }, (_, i) => {
        const theta = (i * 2 * Math.PI) / DOT_COUNT;
        return (
          <View
            key={i}
            style={[
              styles.orbitDot,
              {
                backgroundColor: colors.onPrimary,
                opacity: 1 - i * 0.25,
                transform: [
                  { translateX: Math.cos(theta) * ORBIT_RADIUS },
                  { translateY: Math.sin(theta) * ORBIT_RADIUS },
                ],
              },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

/** Animated AI orb. Idle breathes; listening pulses rings and a wave; thinking orbits; speaking waves gently. */
export function VoiceOrb({ state, onPress }: VoiceOrbProps) {
  const colors = useTheme();
  const reduceMotion = useReducedMotion();
  const breathe = useSharedValue(0);
  const active = useSharedValue(0);

  const listening = state === 'listening';
  const thinking = state === 'thinking';
  const speaking = state === 'speaking';
  const busy = listening || thinking || speaking;
  const accent = speaking ? colors.speaking : colors.primary;
  const onAccent = speaking ? colors.onSpeaking : colors.onPrimary;

  useEffect(() => {
    active.value = withTiming(busy ? 1 : 0, { duration: reduceMotion ? 0 : 250 });
  }, [busy, reduceMotion, active]);

  useEffect(() => {
    cancelAnimation(breathe);
    if (busy || reduceMotion) {
      breathe.value = withTiming(0, { duration: 150 });
      return;
    }
    breathe.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(breathe);
  }, [busy, reduceMotion, breathe]);

  const coreStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breathe.value, [0, 1], [0.85, 1]),
    transform: [
      { scale: interpolate(breathe.value, [0, 1], [1, 1.06]) * interpolate(active.value, [0, 1], [1, 1.08]) },
    ],
  }));
  const accentStyle = useAnimatedStyle(() => ({ opacity: active.value }));

  return (
    <View style={styles.stage}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={ORB_LABEL[state]}
        accessibilityState={{ busy: thinking, selected: busy }}
        style={styles.pressable}
        testID="voice-orb">
        {Array.from({ length: RING_COUNT }, (_, i) => (
          <PulseRing
            key={i}
            listening={listening}
            reduceMotion={reduceMotion}
            delay={(i * RING_DURATION) / RING_COUNT}
          />
        ))}
        <Animated.View
          style={[
            styles.core,
            { backgroundColor: colors.backgroundSelected, borderColor: accent },
            coreStyle,
          ]}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: accent }, accentStyle]} />
          {listening ? (
            <View style={styles.bars} testID="voice-listening-indicator">
              {Array.from({ length: BAR_COUNT }, (_, i) => (
                <WaveBar key={i} index={i} reduceMotion={reduceMotion} color={onAccent} />
              ))}
            </View>
          ) : thinking ? (
            <View style={styles.indicator} testID="voice-thinking-indicator">
              <ThinkingDots reduceMotion={reduceMotion} />
            </View>
          ) : speaking ? (
            <View style={styles.bars} testID="voice-speaking-indicator">
              {Array.from({ length: BAR_COUNT }, (_, i) => (
                <WaveBar key={i} index={i} reduceMotion={reduceMotion} gentle color={onAccent} />
              ))}
            </View>
          ) : (
            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: CORE_SIZE * 2.2,
    height: CORE_SIZE * 2.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
    width: CORE_SIZE,
    height: CORE_SIZE,
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: CORE_SIZE,
    height: CORE_SIZE,
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
  core: {
    width: CORE_SIZE,
    height: CORE_SIZE,
    borderRadius: Radius.pill,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: BAR_HEIGHT,
  },
  bar: {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: Radius.pill,
  },
  indicator: { width: CORE_SIZE, height: CORE_SIZE, alignItems: 'center', justifyContent: 'center' },
  orbit: { width: DOT_SIZE, height: DOT_SIZE },
  orbitDot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: Radius.pill,
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: Radius.pill,
  },
});
