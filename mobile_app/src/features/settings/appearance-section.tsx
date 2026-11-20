import { View } from 'react-native';

import { SegmentedControl, type SegmentedOption } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useThemePreference, type ThemePreference } from '@/lib/theme-preference';

const OPTIONS: readonly SegmentedOption<ThemePreference>[] = [
  { value: 'system', label: 'Device', testID: 'theme-option-system' },
  { value: 'light', label: 'Light', testID: 'theme-option-light' },
  { value: 'dark', label: 'Dark', testID: 'theme-option-dark' },
];

export function AppearanceSection() {
  const { preference, setPreference } = useThemePreference();

  return (
    <View testID="appearance-section" style={{ gap: Spacing.two }}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Appearance
      </ThemedText>
      <SegmentedControl
        options={OPTIONS}
        value={preference}
        onChange={setPreference}
        accessibilityLabel="Theme"
      />
    </View>
  );
}
