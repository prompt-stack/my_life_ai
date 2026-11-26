export const ALARM_SOUND_IDS = ['sunrise', 'chimes', 'marimba', 'piano', 'guitar'] as const;
export type SoundId = (typeof ALARM_SOUND_IDS)[number];
export const DEFAULT_ALARM_SOUND: SoundId = 'sunrise';

/** Weekdays use ISO numbering: 1 = Monday ... 7 = Sunday. An empty array means a one-time alarm. */
export type NativeAlarm = {
  id: string;
  hour: number;
  minute: number;
  weekdays: number[];
  label?: string;
  sound: SoundId;
  enabled: boolean;
  /** ISO 8601 with UTC offset, or null when disabled / not scheduled. */
  nextTriggerAt: string | null;
};

export type PermissionState = 'granted' | 'denied' | 'unknown';

export type AlarmPermissions = {
  exactAlarm: PermissionState;
  fullScreen: PermissionState | 'not_applicable';
  notifications: PermissionState;
};

export type CreateAlarmInput = {
  hour: number;
  minute: number;
  weekdays?: number[];
  label?: string;
  sound: SoundId;
  enabled?: boolean;
};

export type UpdateAlarmChanges = Partial<{
  hour: number;
  minute: number;
  weekdays: number[];
  label: string | null;
  sound: SoundId;
  enabled: boolean;
}>;

export type AlarmErrorCode =
  | 'ERR_PERMISSION_REQUIRED'
  | 'ERR_NOT_FOUND'
  | 'ERR_UNSUPPORTED'
  | 'ERR_INVALID_ARGS';

export type AlarmDismissReason = 'stop' | 'snooze' | 'timeout' | 'replaced';

export type MyLifeAlarmsEvents = {
  /** `inApp` (Android): the app was in the foreground, so no full-screen ringing screen was launched. */
  onAlarmFired: (event: { id: string; inApp?: boolean }) => void;
  onAlarmDismissed: (event: { id: string; reason: AlarmDismissReason }) => void;
  onAlarmsChanged: (event: Record<string, never>) => void;
};
