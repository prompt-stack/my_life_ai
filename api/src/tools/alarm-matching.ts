import type { Alarm, AlarmTime } from '@mylife/shared';

const MINUTES_PER_DAY = 24 * 60;

/** Distance on a 24-hour dial, so 11:50 PM and 12:10 AM are 20 minutes apart. */
export function circularMinuteDistance(a: AlarmTime, b: AlarmTime): number {
  const diff = Math.abs(a.hour * 60 + a.minute - (b.hour * 60 + b.minute)) % MINUTES_PER_DAY;
  return Math.min(diff, MINUTES_PER_DAY - diff);
}

export type AlarmMatch =
  | { kind: 'exact'; alarm: Alarm }
  | { kind: 'closest'; alarm: Alarm }
  /** The phone reported no alarms. */
  | { kind: 'none' };

/** Enabled alarms first, then the one that rings soonest; alarms that are off (null) last. */
function preferredFirst(a: Alarm, b: Alarm): number {
  if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
  const aTime = a.nextTriggerAt === null ? Number.POSITIVE_INFINITY : Date.parse(a.nextTriggerAt);
  const bTime = b.nextTriggerAt === null ? Number.POSITIVE_INFINITY : Date.parse(b.nextTriggerAt);
  if (aTime === bTime) return 0;
  return aTime < bTime ? -1 : 1;
}

/**
 * Finds the alarm the user means by its time. Exact hour and minute wins;
 * otherwise the closest by circular distance. Ties (and duplicate times) go to
 * an enabled alarm, then to the one that rings soonest.
 */
export function findAlarmMatch(alarms: readonly Alarm[], time: AlarmTime): AlarmMatch {
  if (alarms.length === 0) return { kind: 'none' };

  const ordered = [...alarms].sort(preferredFirst);
  const exact = ordered.find((alarm) => alarm.hour === time.hour && alarm.minute === time.minute);
  if (exact) return { kind: 'exact', alarm: exact };

  // Strictly less keeps the preferred alarm on ties (the list is already in preference order).
  const closest = ordered.reduce((best, alarm) =>
    circularMinuteDistance(alarm, time) < circularMinuteDistance(best, time) ? alarm : best,
  );
  return { kind: 'closest', alarm: closest };
}
