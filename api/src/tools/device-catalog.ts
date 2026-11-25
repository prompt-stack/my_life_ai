import type { DeviceInfo, DeviceToolName } from '@mylife/shared';
import type { DeviceToolDefinition } from './types.js';

export interface DeviceToolCatalog {
  get(name: string): DeviceToolDefinition | undefined;
  list(): readonly DeviceToolDefinition[];
  /**
   * Capability detection: tools this phone can run right now. A tool is offered
   * only when its platform matches and the app reports it as a capability.
   * No device info means no device tools.
   */
  availableFor(device: DeviceInfo | undefined): readonly DeviceToolDefinition[];
}

/** Open/closed: add a device tool by passing another module here. */
export function createDeviceToolCatalog(tools: readonly DeviceToolDefinition[]): DeviceToolCatalog {
  const byName = new Map<DeviceToolName, DeviceToolDefinition>();
  for (const tool of tools) {
    if (byName.has(tool.name)) {
      throw new Error(`Duplicate device tool name: ${tool.name}`);
    }
    byName.set(tool.name, tool);
  }

  function availableFor(device: DeviceInfo | undefined): readonly DeviceToolDefinition[] {
    if (!device) return [];
    return [...byName.values()].filter(
      (tool) => tool.platforms.includes(device.platform) && device.capabilities.includes(tool.name),
    );
  }

  return {
    get: (name) => [...byName.values()].find((tool) => tool.name === name),
    list: () => [...byName.values()],
    availableFor,
  };
}
