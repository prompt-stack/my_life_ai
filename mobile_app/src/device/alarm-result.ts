import {
  ALARM_LABEL_MAX_LENGTH,
  AlarmSchema,
  type Alarm,
  type DeviceToolResult,
} from '@mylife/shared';

import type { NativeAlarm } from '@/lib/native-alarms';

/** Maps a native alarm to the shared `Alarm` contract; null if it does not validate. */
export function toSharedAlarm(native: NativeAlarm): Alarm | null {
  const parsed = AlarmSchema.safeParse({
    ...native,
    label: native.label ? native.label.slice(0, ALARM_LABEL_MAX_LENGTH) : undefined,
  });
  return parsed.success ? parsed.data : null;
}

export function doneResult(alarm?: NativeAlarm): DeviceToolResult {
  const mapped = alarm ? toSharedAlarm(alarm) : null;
  return mapped ? { ok: true, status: 'done', alarm: mapped } : { ok: true, status: 'done' };
}

const ERROR_BY_CODE: Record<string, Extract<DeviceToolResult, { ok: false }>['error']> = {
  ERR_PERMISSION_REQUIRED: 'permission_required',
  ERR_NOT_FOUND: 'not_found',
  ERR_UNSUPPORTED: 'unsupported_platform',
  ERR_INVALID_ARGS: 'invalid_args',
};

/** Turns a native coded error into a tool result. Never leaks native messages to the server. */
export function errorResult(error: unknown): DeviceToolResult {
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  const mapped = typeof code === 'string' ? ERROR_BY_CODE[code] : undefined;
  return { ok: false, error: mapped ?? 'failed' };
}

export const INVALID_ARGS: DeviceToolResult = { ok: false, error: 'invalid_args' };
