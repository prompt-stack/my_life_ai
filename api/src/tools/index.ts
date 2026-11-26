import { createAlarmTool } from './create-alarm.js';
import { deleteAlarmTool } from './delete-alarm.js';
import { createDeviceToolCatalog } from './device-catalog.js';
import { getCurrentTimeTool } from './get-current-time.js';
import { previewAlarmSoundTool } from './preview-alarm-sound.js';
import { snoozeAlarmTool } from './snooze-alarm.js';
import { stopAlarmTool } from './stop-alarm.js';
import type { DeviceToolDefinition, ToolDefinition } from './types.js';
import { updateAlarmTool } from './update-alarm.js';

/**
 * All server tools. Register new tools by adding them here (one file per tool).
 * TODO(Phase 1): createTask, listTasks, ... TODO(Phase 4): remember, recall.
 */
export const serverTools: readonly ToolDefinition[] = [getCurrentTimeTool];

/**
 * All device tools (run on the phone, offered per device capabilities).
 * TODO(Phase 3): composeSms, setBrightness, ...
 */
export const deviceTools: readonly DeviceToolDefinition[] = [
  createAlarmTool,
  updateAlarmTool,
  deleteAlarmTool,
  previewAlarmSoundTool,
  stopAlarmTool,
  snoozeAlarmTool,
];

/** Catalog of the registered device tools (pure data, no I/O). */
export const defaultDeviceToolCatalog = createDeviceToolCatalog(deviceTools);
