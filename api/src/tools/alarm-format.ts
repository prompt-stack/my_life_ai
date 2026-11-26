import { ALARM_SOUNDS, type AlarmSoundId, type AlarmTime, type Weekday } from '@mylife/shared';

/** "6:30 AM", "12:00 PM" (noon), "12:05 AM" (just after midnight). */
export function formatClockTime(time: AlarmTime): string {
  const period = time.hour < 12 ? 'AM' : 'PM';
  const hour12 = time.hour % 12 === 0 ? 12 : time.hour % 12;
  return `${hour12}:${String(time.minute).padStart(2, '0')} ${period}`;
}

/** "Sunrise" for "sunrise". */
export function alarmSoundName(sound: AlarmSoundId): string {
  return ALARM_SOUNDS.find((entry) => entry.id === sound)?.name ?? sound;
}

/** "Sunrise, Chimes, Marimba, Piano or Guitar" (or "and"). */
export function listAlarmSoundNames(conjunction: 'or' | 'and'): string {
  const names = ALARM_SOUNDS.map((sound) => sound.name);
  return `${names.slice(0, -1).join(', ')} ${conjunction} ${names.at(-1) ?? ''}`;
}

const WEEKDAY_NAMES: Record<Weekday, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

/** Sorted, without duplicates. */
export function normalizeWeekdays(weekdays: readonly Weekday[]): Weekday[] {
  return [...new Set(weekdays)].sort((a, b) => a - b);
}

export function sameWeekdays(a: readonly Weekday[], b: readonly Weekday[]): boolean {
  const left = normalizeWeekdays(a);
  const right = normalizeWeekdays(b);
  return left.length === right.length && left.every((day, index) => day === right[index]);
}

/** "one time", "every weekday", "weekends", "every day", "every Monday and Thursday". */
export function formatRepeat(weekdays: readonly Weekday[]): string {
  const days = normalizeWeekdays(weekdays);
  if (days.length === 0) return 'one time';
  if (days.length === 7) return 'every day';
  if (sameWeekdays(days, [1, 2, 3, 4, 5])) return 'every weekday';
  if (sameWeekdays(days, [6, 7])) return 'weekends';
  const names = days.map((day) => WEEKDAY_NAMES[day]);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
  return `every ${list}`;
}
