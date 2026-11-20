import { Stack } from 'expo-router';

import { CONTROLS } from '@/features/controls/controls';

export default function ControlsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Controls' }} />
      {CONTROLS.map((control) => (
        <Stack.Screen key={control.key} name={control.key} options={{ title: control.title }} />
      ))}
    </Stack>
  );
}
