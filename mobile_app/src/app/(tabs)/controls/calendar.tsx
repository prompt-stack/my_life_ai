import { ControlScreen } from '@/components/control-screen';

export default function CalendarScreen() {
  return (
    <ControlScreen
      testID="calendar-screen"
      description="See your upcoming events and add new ones."
      actionLabel="Add event"
      chatHint="Add dentist on Friday at 3 PM"
    />
  );
}
