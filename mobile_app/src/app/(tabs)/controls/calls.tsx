import { ControlScreen } from '@/components/control-screen';

export default function CallsScreen() {
  return (
    <ControlScreen
      testID="calls-screen"
      description="Start a call with someone from your contacts."
      actionLabel="Call someone"
      chatHint="Call Dad"
      platformNote="MyLife AI opens the dialer and you confirm the call. It has no access to your call history."
    />
  );
}
