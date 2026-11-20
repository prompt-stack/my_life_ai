/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    primary: '#208AEF',
    onPrimary: '#ffffff',
    primaryDisabled: '#CFE3F8',
    onPrimaryDisabled: '#3D5470',
    border: '#D9DBE0',
    freeBadge: '#DCF5E4',
    onFreeBadge: '#0B5D28',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#1E2024',
    backgroundSelected: '#2C2F35',
    textSecondary: '#B0B4BA',
    primary: '#3C9AFF',
    onPrimary: '#000000',
    primaryDisabled: '#2B3B4D',
    onPrimaryDisabled: '#B4C6DA',
    border: '#3F434A',
    freeBadge: '#12361F',
    onFreeBadge: '#8EE0A8',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  medium: 12,
  large: 16,
  pill: 999,
} as const;

export const MinTouchTarget = 44;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
