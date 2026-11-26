import { describe, expect, it } from 'vitest';
import {
  alarmSoundName,
  formatClockTime,
  formatRepeat,
  listAlarmSoundNames,
  normalizeWeekdays,
  sameWeekdays,
} from './alarm-format.js';

describe('formatClockTime', () => {
  it.each([
    [{ hour: 0, minute: 0 }, '12:00 AM'],
    [{ hour: 0, minute: 5 }, '12:05 AM'],
    [{ hour: 6, minute: 30 }, '6:30 AM'],
    [{ hour: 12, minute: 0 }, '12:00 PM'],
    [{ hour: 18, minute: 0 }, '6:00 PM'],
    [{ hour: 23, minute: 59 }, '11:59 PM'],
  ])('formats %o as %s', (time, expected) => {
    expect(formatClockTime(time)).toBe(expected);
  });
});

describe('sound names', () => {
  it('names sounds and lists them for speech', () => {
    expect(alarmSoundName('marimba')).toBe('Marimba');
    expect(listAlarmSoundNames('or')).toBe('Sunrise, Chimes, Marimba, Piano or Guitar');
    expect(listAlarmSoundNames('and')).toBe('Sunrise, Chimes, Marimba, Piano and Guitar');
  });
});

describe('weekdays', () => {
  it('normalizes and compares as sets', () => {
    expect(normalizeWeekdays([5, 1, 5, 3])).toEqual([1, 3, 5]);
    expect(sameWeekdays([7, 6], [6, 7, 6])).toBe(true);
    expect(sameWeekdays([1], [])).toBe(false);
  });

  it.each([
    [[], 'one time'],
    [[1, 2, 3, 4, 5], 'every weekday'],
    [[7, 6], 'weekends'],
    [[1, 2, 3, 4, 5, 6, 7], 'every day'],
    [[3], 'every Wednesday'],
    [[4, 1], 'every Monday and Thursday'],
    [[1, 3, 5], 'every Monday, Wednesday and Friday'],
  ])('describes %j as %s', (days, expected) => {
    expect(formatRepeat(days)).toBe(expected);
  });
});
