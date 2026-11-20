import { ScreenPlaceholder } from '@/components/screen-placeholder';

/** TODO(Phase 2): list tasks from GET /tasks (rows use testID `task-row-<id>`). */
export default function TasksScreen() {
  return (
    <ScreenPlaceholder
      title="Tasks"
      description="Tasks the agent creates for you will appear here."
      testID="tasks-screen"
    />
  );
}
