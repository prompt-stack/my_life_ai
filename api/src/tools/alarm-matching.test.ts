import { describe, expect, it } from 'vitest';
import { EVENING, testAlarm, WAKE } from '../test-utils/alarms.js';
import { circularMinuteDistance, findAlarmMatch } from './alarm-matching.js';

describe('circularMinuteDistance', () => {
  it('measures around midnight', () => {
    expect(circularMinuteDistance({ hour: 23, minute: 50 }, { hour: 0, minute: 10 })).toBe(20);
    expect(circularMinuteDistance({ hour: 6, minute: 0 }, { hour: 6, minute: 30 })).toBe(30);
    expect(circularMinuteDistance({ hour: 0, minute: 0 }, { hour: 12, minute: 0 })).toBe(720);
    expect(circularMinuteDistance({ hour: 7, minute: 0 }, { hour: 7, minute: 0 })).toBe(0);
  });
});

describe('findAlarmMatch', () => {
  it('returns none without alarms', () => {
    expect(findAlarmMatch([], { hour: 7, minute: 0 })).toEqual({ kind: 'none' });
  });

  it('prefers an exact match, including an alarm that is off', () => {
    expect(findAlarmMatch([EVENING, WAKE], { hour: 6, minute: 30 })).toEqual({ kind: 'exact', alarm: WAKE });
    expect(findAlarmMatch([EVENING, WAKE], { hour: 21, minute: 0 })).toEqual({ kind: 'exact', alarm: EVENING });
  });

  it('falls back to the closest by circular distance', () => {
    expect(findAlarmMatch([EVENING, WAKE], { hour: 6, minute: 0 })).toEqual({ kind: 'closest', alarm: WAKE });
    expect(findAlarmMatch([EVENING, WAKE], { hour: 23, minute: 0 })).toEqual({ kind: 'closest', alarm: EVENING });
  });

  it('breaks distance ties by the soonest nextTriggerAt', () => {
    const at6 = testAlarm({ id: 'b1', hour: 6, minute: 0, nextTriggerAt: '2026-01-03T22:00:00.000Z' });
    const at8 = testAlarm({ id: 'b2', hour: 8, minute: 0, nextTriggerAt: '2026-01-03T00:00:00.000Z' });
    expect(findAlarmMatch([at6, at8], { hour: 7, minute: 0 })).toEqual({ kind: 'closest', alarm: at8 });
  });

  it('prefers enabled alarms, then the soonest, for duplicate times', () => {
    const off = testAlarm({ id: 'c0', hour: 7, minute: 0, enabled: false, nextTriggerAt: null });
    const later = testAlarm({ id: 'c1', hour: 7, minute: 0, nextTriggerAt: '2026-01-04T23:00:00.000Z' });
    const sooner = testAlarm({ id: 'c2', hour: 7, minute: 0, nextTriggerAt: '2026-01-02T23:00:00+00:00' });
    expect(findAlarmMatch([off, later, sooner], { hour: 7, minute: 0 })).toEqual({ kind: 'exact', alarm: sooner });
    expect(findAlarmMatch([off, later], { hour: 7, minute: 0 })).toEqual({ kind: 'exact', alarm: later });
  });

  it('prefers an enabled alarm on a distance tie even if the other one has no trigger time', () => {
    const offAt6 = testAlarm({ id: 'd1', hour: 6, minute: 0, enabled: false, nextTriggerAt: null });
    const onAt8 = testAlarm({ id: 'd2', hour: 8, minute: 0 });
    expect(findAlarmMatch([offAt6, onAt8], { hour: 7, minute: 0 })).toEqual({ kind: 'closest', alarm: onAt8 });
  });
});
