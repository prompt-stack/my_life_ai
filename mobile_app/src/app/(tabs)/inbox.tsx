import { ScreenPlaceholder } from '@/components/screen-placeholder';

/** TODO(Phase 6): pending approvals for sensitive tool calls (approve/reject buttons). */
export default function InboxScreen() {
  return (
    <ScreenPlaceholder
      title="Inbox"
      description="Actions waiting for your approval will appear here."
      testID="inbox-screen"
    />
  );
}
