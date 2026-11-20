import type { Href } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';

export type ControlKey =
  | 'alarms'
  | 'calendar'
  | 'messages'
  | 'calls'
  | 'contacts'
  | 'brightness'
  | 'apps';

/** Cross-platform icon: SF Symbol on iOS, Material Symbol on Android. */
export type ControlSymbol = Extract<SymbolViewProps['name'], { ios?: unknown }>;

export type ControlDefinition = {
  key: ControlKey;
  title: string;
  subtitle: string;
  symbol: ControlSymbol;
  href: Href;
  /** 'free' works for guests; 'pro' will open the sign-in sheet. */
  plan: 'free' | 'pro';
};

/** Single source of truth for the Controls menu (and the nested stack titles). */
export const CONTROLS: readonly ControlDefinition[] = [
  { key: 'alarms', title: 'Alarms', subtitle: 'Set and manage alarms', symbol: { ios: 'alarm', android: 'alarm' }, href: '/controls/alarms', plan: 'free' },
  { key: 'calendar', title: 'Calendar', subtitle: 'Events and schedule', symbol: { ios: 'calendar', android: 'calendar_month' }, href: '/controls/calendar', plan: 'free' },
  { key: 'messages', title: 'Messages', subtitle: 'Compose a text', symbol: { ios: 'message', android: 'sms' }, href: '/controls/messages', plan: 'free' },
  { key: 'calls', title: 'Calls', subtitle: 'Call a contact', symbol: { ios: 'phone', android: 'call' }, href: '/controls/calls', plan: 'free' },
  { key: 'contacts', title: 'Contacts', subtitle: 'Find people', symbol: { ios: 'person.crop.circle', android: 'contacts' }, href: '/controls/contacts', plan: 'free' },
  { key: 'brightness', title: 'Brightness', subtitle: 'Adjust the screen', symbol: { ios: 'sun.max', android: 'brightness_medium' }, href: '/controls/brightness', plan: 'free' },
  { key: 'apps', title: 'Apps', subtitle: 'Open Maps, Mail, Camera…', symbol: { ios: 'square.grid.2x2', android: 'apps' }, href: '/controls/apps', plan: 'free' },
];
