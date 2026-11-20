import { ControlScreen } from '@/components/control-screen';

export default function AlarmsScreen() {
  return (
    <ControlScreen
      testID="alarms-screen"
      description="Set, review and cancel alarms for yourself."
      actionLabel="New alarm"
      chatHint="Wake me up at 6:30 tomorrow"
      platformNote="Alarms are owned by this app. MyLife AI cannot see or change alarms in the Clock app."
    />
  );
}
