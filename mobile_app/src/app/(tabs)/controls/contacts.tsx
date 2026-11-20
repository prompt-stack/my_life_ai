import { ControlScreen } from '@/components/control-screen';

export default function ContactsScreen() {
  return (
    <ControlScreen
      testID="contacts-screen"
      description="Look up people in your contacts."
      actionLabel="Search contacts"
      chatHint="What is Anna's phone number?"
    />
  );
}
