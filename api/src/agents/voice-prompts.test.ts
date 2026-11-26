import { describe, expect, it } from 'vitest';
import {
  ALARM_RULES,
  DEVICE_RESULT_RULES,
  DEVICE_RESULT_SYSTEM_PROMPT,
  userTurnSystemPrompt,
  VOICE_SYSTEM_PROMPT,
} from './voice-prompts.js';

describe('VOICE_SYSTEM_PROMPT (always sent)', () => {
  it.each([
    ['spoken, short replies', /read aloud: one to three short/],
    ['tools depend on the phone', /depends on the phone/],
    ['never claim success without a tool result', /Never say you did something on the phone unless a tool result says it succeeded/],
    ['unsupported features are coming soon', /cannot set timers, send texts, place calls/],
  ])('includes: %s', (_label, pattern) => {
    expect(VOICE_SYSTEM_PROMPT).toMatch(pattern);
  });

  it('carries no alarm rules (they are sent only with alarm tools)', () => {
    expect(VOICE_SYSTEM_PROMPT).not.toMatch(/createAlarm|updateAlarm|deleteAlarm|previewAlarmSound|Sunrise/);
  });
});

describe('ALARM_RULES (sent only when alarm tools are offered)', () => {
  it.each([
    ["alarms are MyLife's own", /Alarms are MyLife's own alarms/],
    ['AM/PM in any form is complete', /\(AM, am, a\.m\., PM, pm, p\.m\.\) is complete: call createAlarm right away/],
    ['never ask AM or PM when given', /never ask "AM or PM\?"/],
    ['unambiguous times', /noon, midnight/],
    ['relative times from the current local time', /in 20 minutes.*current local time/],
    ['update uses the AM/PM rules', /same applies to a new time for updateAlarm/],
    ['ask for a missing time', /for "set an alarm", ask what time/],
    ['ask AM or PM only when missing', /no AM or PM and nothing else settles it.*"7 AM or 7 PM\?"/],
    ['example: 7 AM', /"Set an alarm for 7 AM" means createAlarm with hour 7, minute 0/],
    ['example: 7 p.m.', /"Alarm at 7 p\.m\." means hour 19/],
    ['example: at 7 asks', /"Set an alarm at 7" means ask "7 AM or 7 PM\?"/],
    ['weekday numbering', /1 is Monday to 7 is Sunday/],
    ['every weekday / weekends / every day', /every weekday is 1 to 5, weekends are 6 and 7, every day is 1 to 7/],
    ['no specific dates', /specific future date.*is not supported/],
    ['short label', /short label/],
    ['sound list and default, said when asked', /Sunrise, Chimes, Marimba, Piano and Guitar\. Sunrise is the default\. Say exactly that when asked what sounds there are/],
    ['aliases once', /Aliases: default\/normal\/regular\/standard=sunrise, .*xylophone=marimba/],
    ['never ask for a sound', /Never ask which sound to use/],
    ['only pass a named sound', /pass a sound only if the user names one/],
    ['vague sound asks once', /"something calm"\), ask once: Which sound: Sunrise, Chimes, Marimba, Piano or Guitar\?/],
    ['preview tool', /To play a sound, call previewAlarmSound/],
    ['list from context, no tool', /answer from the list without calling a tool/],
    ['update/delete tools', /call updateAlarm; to delete one call deleteAlarm/],
    ['always call update/delete with the spoken time', /Always set target to the time the user said, even if no listed alarm has exactly that time/],
    ['the app finds the closest alarm', /the app finds the closest alarm and asks the user to confirm it/],
    ['never claim an alarm does not exist', /Never say yourself that an alarm does not exist/],
    ['only "no alarms" when the list is empty', /Only when the list says No alarms yet/],
    ['confirmed proposal → exact time', /they agree, call the same tool with exactly that proposed time/],
    ['one tool per request', /at most one phone tool per request/],
    ['confirmation mentions the sound', /Alarm set for 6 AM with Sunrise/],
    ['preview confirmation', /That was Marimba/],
    ['never claim success', /Never claim success unless the result is ok/],
    ['stop while ringing', /While an alarm is ringing: stop, dismiss, turn it off or enough means stopAlarm/],
    ['snooze while ringing, minutes only if said', /snooze or "5 more minutes" means snoozeAlarm, with minutes only if said/],
    ['nothing ringing', /If none is ringing, say: There's no alarm ringing right now\./],
    ['stop confirmation', /After stopAlarm: "Alarm stopped\."/],
    ['snooze confirmation', /After snoozeAlarm: "Snoozed for <minutes> minutes\."/],
  ])('includes: %s', (_label, pattern) => {
    expect(ALARM_RULES).toMatch(pattern);
  });

  it('puts AM/PM completeness before the "ask only if" rule', () => {
    const complete = ALARM_RULES.indexOf('is complete: call createAlarm');
    const ask = ALARM_RULES.indexOf('Ask only if');
    expect(complete).toBeGreaterThan(-1);
    expect(complete).toBeLessThan(ask);
  });

  it.each([/setAlarm/, /cancelAlarm/, /editAlarm/, /showAlarms/, /the Clock app/, /dispatched/, /opened_clock/])(
    'no longer mentions %s',
    (pattern) => {
      expect(`${VOICE_SYSTEM_PROMPT}\n${ALARM_RULES}`).not.toMatch(pattern);
    },
  );
});

describe('system prompt per turn', () => {
  it('adds the alarm rules after the stable base prompt only when asked', () => {
    expect(userTurnSystemPrompt(true)).toBe(`${VOICE_SYSTEM_PROMPT}\n${ALARM_RULES}`);
    expect(userTurnSystemPrompt(false)).toBe(VOICE_SYSTEM_PROMPT);
  });

  it('gives the continuation turn only the confirmation guidance, not the alarm rules', () => {
    expect(DEVICE_RESULT_SYSTEM_PROMPT).toBe(`${VOICE_SYSTEM_PROMPT}\n${DEVICE_RESULT_RULES}`);
    expect(DEVICE_RESULT_SYSTEM_PROMPT).not.toContain('Ask only if');
  });
});
