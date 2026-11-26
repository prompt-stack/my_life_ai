import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { AlarmForm } from '@/features/alarms/components/alarm-form';
import { useAlarms } from '@/features/alarms/hooks/use-alarms';
import { Spacing } from '@/constants/theme';

export default function AlarmEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { alarms, loading, failed, refresh } = useAlarms();

  if (!id) return <AlarmForm key="new" initial={undefined} />;
  if (loading) {
    return (
      <View style={styles.center} testID="alarm-edit-loading">
        <ActivityIndicator />
      </View>
    );
  }
  const alarm = alarms?.find((item) => item.id === id);
  if (failed || !alarm) {
    return (
      <View style={styles.center} testID="alarm-edit-missing">
        <ThemedText themeColor="textSecondary">
          {failed ? "Couldn't load this alarm." : 'This alarm no longer exists.'}
        </ThemedText>
        {failed ? <PrimaryButton label="Try again" onPress={() => void refresh()} /> : null}
      </View>
    );
  }
  return <AlarmForm key={alarm.id} initial={alarm} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
});
