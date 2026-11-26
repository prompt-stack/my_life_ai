import { Linking, Platform, ScrollView, StyleSheet } from 'react-native';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { SetupRow } from '@/features/alarms/components/setup-row';
import { useAlarmPermissions } from '@/features/alarms/hooks/use-alarm-permissions';
import { useTheme } from '@/hooks/use-theme';
import {
  isAvailable,
  openAutostartSettings,
  openBatterySettings,
  requestAuthorization,
  requestExactAlarmPermission,
  requestFullScreenPermission,
  requestNotificationPermission,
} from '@/lib/native-alarms';

function isXiaomiFamily(): boolean {
  if (Platform.OS !== 'android') return false;
  const { Manufacturer, Brand } = Platform.constants;
  return /xiaomi|redmi|poco/i.test(`${Manufacturer} ${Brand}`);
}

/** Permissions checklist. Statuses re-check on focus and when returning from system settings. */
export default function AlarmSetupScreen() {
  const colors = useTheme();
  const { permissions, refresh } = useAlarmPermissions();
  const [notificationsAsked, setNotificationsAsked] = useState(false);
  const [authAsked, setAuthAsked] = useState(false);
  const available = isAvailable();

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch {
      // Opening a settings screen can fail on some ROMs; the row stays as it was.
    }
    void refresh();
  };

  return (
    <ScrollView testID="alarm-setup-screen" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <ThemedText themeColor="textSecondary">
        {Platform.OS === 'ios'
          ? 'MyLife AI needs your permission to schedule alarms.'
          : 'A few permissions make sure alarms ring on time, even with the screen off.'}
      </ThemedText>

      {!available ? (
        <ThemedView type="backgroundElement" style={[styles.card, { borderColor: colors.border }]} testID="alarm-setup-unavailable">
          <ThemedText type="smallBold">Alarms aren&apos;t available here</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {Platform.OS === 'ios'
              ? 'Alarms need iOS 26 or later.'
              : 'Install the latest MyLife AI development build.'}
          </ThemedText>
        </ThemedView>
      ) : Platform.OS === 'ios' ? (
        <SetupRow
          testID="alarm-setup-allow"
          title="Allow alarms"
          description="Lets alarms sound and show on the Lock Screen."
          status={permissions?.exactAlarm ?? 'unknown'}
          actionLabel={permissions?.exactAlarm === 'denied' || authAsked ? 'Open Settings' : 'Allow'}
          onAction={() =>
            run(async () => {
              if (permissions?.exactAlarm === 'denied' || authAsked) await Linking.openSettings();
              else {
                setAuthAsked(true);
                await requestAuthorization();
              }
            })
          }
        />
      ) : (
        <>
          <SetupRow
            testID="alarm-setup-notifications"
            title="Notifications"
            description="Shows the alarm and its Stop and Snooze buttons."
            status={permissions?.notifications ?? 'unknown'}
            actionLabel={notificationsAsked && permissions?.notifications === 'denied' ? 'Open settings' : 'Allow'}
            onAction={() =>
              run(async () => {
                if (notificationsAsked && permissions?.notifications === 'denied') await Linking.openSettings();
                else {
                  setNotificationsAsked(true);
                  await requestNotificationPermission();
                }
              })
            }
          />
          <SetupRow
            testID="alarm-setup-exact"
            title="Alarms & reminders"
            description="Lets alarms ring at the exact minute."
            status={permissions?.exactAlarm ?? 'unknown'}
            actionLabel="Open settings"
            onAction={() => run(requestExactAlarmPermission)}
          />
          {permissions?.fullScreen !== 'not_applicable' ? (
            <SetupRow
              testID="alarm-setup-fullscreen"
              title="Full-screen alerts"
              description="Shows the alarm over the lock screen."
              status={permissions?.fullScreen ?? 'unknown'}
              actionLabel="Open settings"
              onAction={() => run(requestFullScreenPermission)}
            />
          ) : null}
          <SetupRow
            testID="alarm-setup-battery"
            title="Battery: no restrictions"
            description="Recommended. Stops the phone from putting alarms to sleep."
            actionLabel="Open settings"
            onAction={() => run(openBatterySettings)}
          />
          {isXiaomiFamily() ? (
            <SetupRow
              testID="alarm-setup-autostart"
              title="Autostart"
              description="Xiaomi, Redmi and POCO phones: allow MyLife AI to start after a restart so alarms survive reboots."
              actionLabel="Open settings"
              onAction={() => run(openAutostartSettings)}
            />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three },
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
