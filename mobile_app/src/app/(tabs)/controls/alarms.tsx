import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';

import { PlanBadge } from '@/components/plan-badge';
import { SecondaryButton } from '@/components/secondary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { AlarmRow } from '@/features/alarms/components/alarm-row';
import { AlarmSetupBanner } from '@/features/alarms/components/setup-banner';
import { useAlarmPermissions } from '@/features/alarms/hooks/use-alarm-permissions';
import { useAlarms } from '@/features/alarms/hooks/use-alarms';
import { alarmEditHref } from '@/features/alarms/routes';
import { useTheme } from '@/hooks/use-theme';
import {
  isAlarmErrorCode,
  isAvailable,
  requestExactAlarmPermission,
  requestNotificationPermission,
  updateAlarm,
  type NativeAlarm,
} from '@/lib/native-alarms';

const SKELETON_ROWS = [0, 1, 2];

export default function AlarmsScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { alarms, failed, loading, refresh, replace } = useAlarms();
  const { permissions, needsSetup, refresh: refreshPermissions } = useAlarmPermissions();
  const available = isAvailable();

  const onAdd = async () => {
    // Just-in-time: the first time someone makes an alarm, ask for the first missing permission.
    if (Platform.OS === 'android' && alarms?.length === 0 && permissions) {
      try {
        if (permissions.notifications === 'denied') {
          await requestNotificationPermission();
        } else if (permissions.exactAlarm === 'denied') {
          await requestExactAlarmPermission();
        }
      } catch {
        // The checklist banner stays available if the request cannot be shown.
      }
      void refreshPermissions();
    }
    router.push(alarmEditHref());
  };

  const onToggle = async (alarm: NativeAlarm, enabled: boolean) => {
    replace({ ...alarm, enabled });
    try {
      await updateAlarm(alarm.id, { enabled });
    } catch (error) {
      if (isAlarmErrorCode(error, 'ERR_PERMISSION_REQUIRED')) {
        Alert.alert('Permission needed', 'Allow alarms in setup, then turn this alarm on again.');
      } else {
        Alert.alert('Could not change the alarm', 'Please try again.');
      }
    } finally {
      void refresh();
    }
  };

  const header = (
    <View style={styles.header}>
      <PlanBadge label="Free" testID="alarms-screen-free-badge" />
      {needsSetup ? <AlarmSetupBanner testID="alarm-setup-banner" /> : null}
      {!available ? (
        <ThemedView type="backgroundElement" style={[styles.card, { borderColor: colors.border }]} testID="alarms-unavailable">
          <ThemedText type="smallBold">Alarms aren&apos;t available here</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {Platform.OS === 'ios'
              ? 'Alarms need iOS 26 or later.'
              : 'Alarms need the latest MyLife AI build. Install the newest development build.'}
          </ThemedText>
        </ThemedView>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen} testID="alarms-screen">
      <Stack.Screen
        options={{
          headerRight: () =>
            available ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New alarm"
                onPress={onAdd}
                testID="alarm-add-button"
                hitSlop={Spacing.two}
                style={styles.addButton}>
                <SymbolView name={{ ios: 'plus', android: 'add' }} size={24} tintColor={colors.primary} />
              </Pressable>
            ) : null,
        }}
      />
      <FlatList
        data={available && !loading && !failed ? (alarms ?? []) : []}
        keyExtractor={(alarm) => alarm.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <AlarmRow
            alarm={item}
            onPress={() => router.push(alarmEditHref(item.id))}
            onToggle={(enabled) => void onToggle(item, enabled)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          available ? (
            loading ? (
              <View style={styles.skeletons} testID="alarms-loading" accessibilityLabel="Loading alarms">
                {SKELETON_ROWS.map((key) => (
                  <View key={key} style={[styles.skeleton, { backgroundColor: colors.backgroundElement }]} />
                ))}
              </View>
            ) : failed ? (
              <View style={styles.message} testID="alarms-error">
                <ThemedText themeColor="textSecondary">Couldn&apos;t load your alarms.</ThemedText>
                <SecondaryButton label="Try again" onPress={() => void refresh()} testID="alarms-retry-button" />
              </View>
            ) : (
              <View style={styles.message} testID="alarms-empty">
                <ThemedText themeColor="textSecondary">
                  No alarms yet. Tap + or ask the Assistant.
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Try “Wake me up at 6:30 tomorrow”.
                </ThemedText>
              </View>
            )
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.four, flexGrow: 1 },
  header: { gap: Spacing.three, marginBottom: Spacing.three },
  separator: { height: Spacing.two },
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  message: { gap: Spacing.two, paddingVertical: Spacing.three },
  skeletons: { gap: Spacing.two },
  skeleton: { height: MinTouchTarget * 2, borderRadius: Radius.large },
  addButton: { minWidth: MinTouchTarget, minHeight: MinTouchTarget, alignItems: 'center', justifyContent: 'center' },
});
