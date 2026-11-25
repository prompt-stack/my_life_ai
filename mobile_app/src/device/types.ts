import type { DeviceToolName, DeviceToolResult } from '@mylife/shared';

export type DeviceToolRisk = 'read' | 'write' | 'sensitive';
export type DevicePlatform = 'android' | 'ios';

/** One allowlisted device tool: its handler runs on the phone, the server only decides. */
export type DeviceToolHandler = {
  name: DeviceToolName;
  risk: DeviceToolRisk;
  platforms: DevicePlatform[];
  /** True when the native pieces needed by this tool exist in the running build. */
  isAvailable(): boolean;
  /** Validates `args` itself (rule 8) and never throws for expected failures. */
  execute(args: unknown): Promise<DeviceToolResult>;
};
