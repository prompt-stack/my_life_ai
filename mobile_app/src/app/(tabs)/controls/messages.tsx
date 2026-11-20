import { ControlScreen } from '@/components/control-screen';

export default function MessagesScreen() {
  return (
    <ControlScreen
      testID="messages-screen"
      description="Draft a text message to someone."
      actionLabel="Compose message"
      chatHint="Text Mom that I will be late"
      platformNote="MyLife AI opens a pre-filled composer and you tap Send yourself. It cannot read your messages."
    />
  );
}
