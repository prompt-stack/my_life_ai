import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ALARM_SETUP_HREF } from '../routes';

type Props = { testID: string };

/** Tappable notice that opens the permissions checklist. */
export function AlarmSetupBanner({ testID }: Props) {
  const colors = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Alarms need a few permissions. Open setup."
      onPress={() => router.push(ALARM_SETUP_HREF)}
      testID={testID}
      style={({ pressed }) => [
        styles.banner,
        { backgroundColor: colors.warningSurface, opacity: pressed ? 0.85 : 1 },
      ]}>
      <ThemedText type="smallBold" themeColor="onWarningSurface">
        Alarms need a few permissions
      </ThemedText>
      <ThemedText type="small" themeColor="onWarningSurface">
        Tap to finish setup so alarms ring reliably.
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: MinTouchTarget,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.half,
  },
});
