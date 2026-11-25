import { SetAlarmArgsSchema, type DeviceToolResult } from '@mylife/shared';
import { Platform } from 'react-native';

import { IntentLauncher } from '@/lib/intent-launcher';

import type { DeviceToolHandler } from './types';

const ACTION_SET_ALARM = 'android.intent.action.SET_ALARM';
/** The Clock app may keep the activity result pending, so a timeout counts as dispatched. */
const DISPATCH_TIMEOUT_MS = 4_000;
const MAX_MESSAGE_LENGTH = 300;

const DISPATCHED: DeviceToolResult = { ok: true, status: 'dispatched' };

function failure(error: Extract<DeviceToolResult, { ok: false }>['error'], message?: string): DeviceToolResult {
  return message ? { ok: false, error, message: message.slice(0, MAX_MESSAGE_LENGTH) } : { ok: false, error };
}

/**
 * expo-intent-launcher rejects with a CodedException:
 * - `ERR_ACTIVITY_ALREADY_STARTED`: a previous launched activity has not returned yet
 * - `ERR_UNEXPECTED` wrapping `android.content.ActivityNotFoundException` ("No Activity found to
 *   handle Intent"): no app handles SET_ALARM
 */
function mapError(error: unknown): DeviceToolResult {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : String(error);
  if (code === 'ERR_ACTIVITY_ALREADY_STARTED') return failure('busy');
  if (/ActivityNotFoundException|No Activity found/i.test(message)) return failure('no_clock_app');
  return failure('failed', message);
}

function timeout(ms: number): { promise: Promise<'timeout'>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

export const setAlarm: DeviceToolHandler = {
  name: 'setAlarm',
  risk: 'write',
  platforms: ['android'],
  isAvailable: () => Platform.OS === 'android' && IntentLauncher !== null,
  async execute(args) {
    if (Platform.OS !== 'android') return failure('unsupported_platform');
    const parsed = SetAlarmArgsSchema.safeParse(args);
    if (!parsed.success) return failure('invalid_args');
    if (!IntentLauncher) return failure('failed', 'Intent launcher is not available in this build');

    const { hour, minute, label } = parsed.data;
    const wait = timeout(DISPATCH_TIMEOUT_MS);
    try {
      await Promise.race([
        IntentLauncher.startActivityAsync(ACTION_SET_ALARM, {
          extra: {
            'android.intent.extra.alarm.HOUR': hour,
            'android.intent.extra.alarm.MINUTES': minute,
            'android.intent.extra.alarm.SKIP_UI': true,
            ...(label ? { 'android.intent.extra.alarm.MESSAGE': label } : {}),
          },
        }),
        wait.promise,
      ]);
      return DISPATCHED;
    } catch (error) {
      return mapError(error);
    } finally {
      wait.cancel();
    }
  },
};
