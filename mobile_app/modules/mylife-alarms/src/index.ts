import { CodedError, type EventSubscription } from 'expo';
import { Platform } from 'react-native';

import native from './MyLifeAlarmsModule';
import type {
  AlarmErrorCode,
  AlarmPermissions,
  CreateAlarmInput,
  MyLifeAlarmsEvents,
  NativeAlarm,
  UpdateAlarmChanges,
} from './MyLifeAlarms.types';

export * from './MyLifeAlarms.types';

const MIN_IOS_MAJOR = 26;

function unsupported(): CodedError {
  return new CodedError(
    'ERR_UNSUPPORTED' satisfies AlarmErrorCode,
    'Native alarms are not available on this device or in this build.',
  );
}

/** Native module present AND (Android, or iOS 26+ where AlarmKit exists). */
export function isAvailable(): boolean {
  if (!native) return false;
  if (Platform.OS === 'android') return true;
  if (Platform.OS === 'ios') return Number.parseInt(String(Platform.Version), 10) >= MIN_IOS_MAJOR;
  return false;
}

function requireNative(): NonNullable<typeof native> {
  if (!native || !isAvailable()) throw unsupported();
  return native;
}

type RawAlarm = Awaited<ReturnType<NonNullable<typeof native>['createAlarm']>>;

/** Native sends `label: null` for "no label"; the public type uses an optional field. */
function toAlarm(raw: RawAlarm): NativeAlarm {
  const { label, ...rest } = raw;
  return label ? { ...rest, label } : rest;
}

export async function getPermissions(): Promise<AlarmPermissions> {
  if (!native || !isAvailable()) {
    return { exactAlarm: 'unknown', fullScreen: 'unknown', notifications: 'unknown' };
  }
  return native.getPermissions();
}

export function requestExactAlarmPermission(): Promise<void> {
  return requireNative().requestExactAlarmPermission();
}

export function requestFullScreenPermission(): Promise<void> {
  return requireNative().requestFullScreenPermission();
}

export function requestNotificationPermission(): Promise<'granted' | 'denied'> {
  return requireNative().requestNotificationPermission();
}

/** iOS (AlarmKit) authorization prompt. On Android it resolves 'granted' (nothing to ask). */
export function requestAuthorization(): Promise<'granted' | 'denied'> {
  return requireNative().requestAuthorization();
}

export function openBatterySettings(): Promise<void> {
  return requireNative().openBatterySettings();
}

/** Best effort: true when the Xiaomi/HyperOS Autostart screen opened, false when app settings opened instead. */
export function openAutostartSettings(): Promise<boolean> {
  return requireNative().openAutostartSettings();
}

export async function listAlarms(): Promise<NativeAlarm[]> {
  return (await requireNative().listAlarms()).map(toAlarm);
}

/** Throws coded errors: ERR_PERMISSION_REQUIRED, ERR_UNSUPPORTED, ERR_INVALID_ARGS. */
export async function createAlarm(input: CreateAlarmInput): Promise<NativeAlarm> {
  return toAlarm(await requireNative().createAlarm(input));
}

/** Only keys present in `changes` are applied; `label: null` clears the label. */
export async function updateAlarm(id: string, changes: UpdateAlarmChanges): Promise<NativeAlarm> {
  return toAlarm(await requireNative().updateAlarm(id, changes));
}

export function deleteAlarm(id: string): Promise<void> {
  return requireNative().deleteAlarm(id);
}

/** Id of the alarm ringing right now, or null. Android: ring service state. iOS: AlarmKit alarm in `alerting`. */
export async function getRingingAlarmId(): Promise<string | null> {
  if (!native || !isAvailable()) return null;
  return native.getRingingAlarmId();
}

/** Android: silence the ringing alarm without dismissing it (auto-resumes after 20 s). iOS: no-op. */
export async function pauseRinging(): Promise<void> {
  if (!native || !isAvailable()) return;
  await native.pauseRinging();
}

/** Android: resume a paused alarm. iOS: no-op. */
export async function resumeRinging(): Promise<void> {
  if (!native || !isAvailable()) return;
  await native.resumeRinging();
}

/**
 * Android: duck the ringing alarm to `fraction` (0..1) of its normal volume without pausing it, so the app can
 * still hear "AI"; 1 restores it. Lapses by itself after 30 s unless called again. No-op on iOS and in dev builds
 * made before this API existed.
 */
export async function setRingVolume(fraction: number): Promise<void> {
  if (!native || !isAvailable() || Platform.OS !== 'android') return;
  await native.setRingVolume?.(Math.min(1, Math.max(0, fraction)));
}

/**
 * Stops the ringing alarm. With `id`, it must be the alarm ringing now (else ERR_NOT_FOUND).
 * Android: without `id`, stops whatever rings (no-op if nothing). iOS: via AlarmKit, ERR_NOT_FOUND if none.
 */
export function stopRinging(id?: string): Promise<void> {
  return requireNative().stopRinging(id);
}

/** Android: snooze the ringing alarm (default 9 minutes, `id` must match). iOS: throws ERR_UNSUPPORTED. */
export function snooze(id?: string, minutes?: number): Promise<void> {
  return requireNative().snooze(id, minutes);
}

export function addListener<E extends keyof MyLifeAlarmsEvents>(
  event: E,
  listener: MyLifeAlarmsEvents[E],
): EventSubscription {
  if (!native || !isAvailable()) return { remove: () => {} };
  return native.addListener(event, listener);
}

export function isAlarmErrorCode(error: unknown, code: AlarmErrorCode): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}
