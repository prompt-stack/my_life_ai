import { type NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  AlarmPermissions,
  CreateAlarmInput,
  MyLifeAlarmsEvents,
  NativeAlarm,
  UpdateAlarmChanges,
} from './MyLifeAlarms.types';

/** Shape of the native module (Kotlin / Swift). Alarms cross the bridge as plain objects. */
declare class MyLifeAlarmsNativeModule extends NativeModule<MyLifeAlarmsEvents> {
  isSupported(): boolean;
  getPermissions(): Promise<AlarmPermissions>;
  requestExactAlarmPermission(): Promise<void>;
  requestFullScreenPermission(): Promise<void>;
  requestNotificationPermission(): Promise<'granted' | 'denied'>;
  requestAuthorization(): Promise<'granted' | 'denied'>;
  openBatterySettings(): Promise<void>;
  openAutostartSettings(): Promise<boolean>;
  listAlarms(): Promise<(Omit<NativeAlarm, 'label'> & { label: string | null })[]>;
  createAlarm(input: CreateAlarmInput): Promise<Omit<NativeAlarm, 'label'> & { label: string | null }>;
  updateAlarm(
    id: string,
    changes: UpdateAlarmChanges,
  ): Promise<Omit<NativeAlarm, 'label'> & { label: string | null }>;
  deleteAlarm(id: string): Promise<void>;
  getRingingAlarmId(): Promise<string | null>;
  pauseRinging(): Promise<void>;
  resumeRinging(): Promise<void>;
  /** Android only (not present in older dev builds, nor on iOS). */
  setRingVolume?(fraction: number): Promise<void>;
  stopRinging(id?: string): Promise<void>;
  snooze(id?: string, minutes?: number): Promise<void>;
}

/** Null in Expo Go, on web, or in a dev build made before this module existed. */
export default requireOptionalNativeModule<MyLifeAlarmsNativeModule>('MyLifeAlarms');
