import { getCurrentTimeTool } from './get-current-time.js';
import type { ToolDefinition } from './types.js';

/**
 * All server tools. Register new tools by adding them here (one file per tool).
 * TODO(Phase 1): createTask, listTasks, ... TODO(Phase 3): device tools (setAlarm, composeSms, ...). TODO(Phase 4): remember, recall.
 */
export const serverTools: readonly ToolDefinition[] = [getCurrentTimeTool];
