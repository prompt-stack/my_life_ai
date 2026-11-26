import { ALARM_SOUNDS, type AlarmSoundId } from '@mylife/shared';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
export const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export function to12Hour(hour24: number): { hour: number; pm: boolean } {
  return { hour: hour24 % 12 === 0 ? 12 : hour24 % 12, pm: hour24 >= 12 };
}

export function to24Hour(hour12: number, pm: boolean): number {
  return (hour12 % 12) + (pm ? 12 : 0);
}

export function formatTime(hour24: number, minute: number): string {
  const { hour, pm } = to12Hour(hour24);
  return `${hour}:${String(minute).padStart(2, '0')} ${pm ? 'PM' : 'AM'}`;
}

/** "Once", "Every day", "Weekdays", "Weekends" or "Mon, Wed". */
export function repeatSummary(weekdays: readonly number[]): string {
  const days = [...new Set(weekdays)].sort((a, b) => a - b);
  if (days.length === 0) return 'Once';
  if (days.length === 7) return 'Every day';
  if (days.join() === '1,2,3,4,5') return 'Weekdays';
  if (days.join() === '6,7') return 'Weekends';
  return days.map((day) => DAY_SHORT[day - 1]).join(', ');
}

export function soundName(id: AlarmSoundId): string {
  return ALARM_SOUNDS.find((sound) => sound.id === id)?.name ?? id;
}
