import { getCurrentTimeTool } from './get-current-time.js';
import { createDeviceToolCatalog } from './device-catalog.js';
import { setAlarmTool } from './set-alarm.js';
import type { DeviceToolDefinition, ToolDefinition } from './types.js';

/**
 * All server tools. Register new tools by adding them here (one file per tool).
 * TODO(Phase 1): createTask, listTasks, ... TODO(Phase 4): remember, recall.
 */
export const serverTools: readonly ToolDefinition[] = [getCurrentTimeTool];

/**
 * All device tools (run on the phone, offered per device capabilities).
 * TODO(Phase 3): composeSms, setBrightness, ...
 */
export const deviceTools: readonly DeviceToolDefinition[] = [setAlarmTool];

/** Catalog of the registered device tools (pure data, no I/O). */
export const defaultDeviceToolCatalog = createDeviceToolCatalog(deviceTools);
