import { Stack } from 'expo-router';

import { CONTROLS } from '@/features/controls/controls';

export default function ControlsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Controls' }} />
      {CONTROLS.map((control) => (
        <Stack.Screen key={control.key} name={control.key} options={{ title: control.title }} />
      ))}
      <Stack.Screen name="alarm-edit" options={{ title: 'Alarm' }} />
      <Stack.Screen name="alarm-sound" options={{ title: 'Sound' }} />
      <Stack.Screen name="alarm-setup" options={{ title: 'Alarm setup' }} />
    </Stack>
  );
}
