import { DEFAULT_SNOOZE_MINUTES, SnoozeAlarmArgsSchema, StopAlarmArgsSchema, type DeviceInfo } from '@mylife/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { androidWithAlarms, WAKE } from '../test-utils/alarms.js';
import { mentionsSnoozeLength, snoozeAlarmTool, SnoozeAlarmModelArgsSchema, snoozeMinutes } from './snooze-alarm.js';
import { isAlarmRinging, NO_RINGING_ALARM_REPLY, stopAlarmTool, StopAlarmModelArgsSchema } from './stop-alarm.js';

const ringing: DeviceInfo = androidWithAlarms([WAKE], { ringingAlarmId: WAKE.id });
const quiet: DeviceInfo = androidWithAlarms([WAKE]);

function jsonSchemaOf(schema: z.ZodType): unknown {
  const generated = { ...z.toJSONSchema(schema) } as { $schema?: string };
  delete generated.$schema;
  return generated;
}

describe('stop and snooze tool definitions', () => {
  it.each([
    [stopAlarmTool, 'stopAlarm', StopAlarmArgsSchema, 'Stop the alarm that is ringing now.'],
    [snoozeAlarmTool, 'snoozeAlarm', SnoozeAlarmArgsSchema, 'Snooze the ringing alarm.'],
  ] as const)('%#: %s is an Android + iOS device tool with write risk', (tool, name, input, description) => {
    expect(tool).toMatchObject({ name, riskLevel: 'write', target: 'device', platforms: ['android', 'ios'], description });
    expect(tool.input).toBe(input);
  });

  it.each([
    ['stopAlarm', stopAlarmTool.parameters, StopAlarmModelArgsSchema],
    ['snoozeAlarm', snoozeAlarmTool.parameters, SnoozeAlarmModelArgsSchema],
  ] as const)('%s shows the model a JSON Schema that matches its Zod schema', (_name, parameters, schema) => {
    expect(parameters).toEqual(jsonSchemaOf(schema));
  });

  it('never lets the model choose the alarm', () => {
    for (const tool of [stopAlarmTool, snoozeAlarmTool]) {
      expect(JSON.stringify(tool.parameters)).not.toContain('alarmId');
    }
    expect(StopAlarmModelArgsSchema.safeParse({ alarmId: 'alarm-2' }).success).toBe(false);
    expect(SnoozeAlarmModelArgsSchema.safeParse({ alarmId: 'alarm-2', minutes: 5 }).success).toBe(false);
  });

  it.each([0, 31, 2.5, -1, '5'])('rejects a model snooze length of %j', (minutes) => {
    expect(SnoozeAlarmModelArgsSchema.safeParse({ minutes }).success).toBe(false);
  });

  it('is offered only while an alarm rings', () => {
    for (const tool of [stopAlarmTool, snoozeAlarmTool]) {
      expect(tool.offerOnlyWhen?.(ringing)).toBe(true);
      expect(tool.offerOnlyWhen?.(quiet)).toBe(false);
      expect(tool.offerOnlyWhen?.(undefined)).toBe(false);
    }
    expect(isAlarmRinging({ ringingAlarmId: '' })).toBe(false);
  });
});

describe('stopAlarmTool.resolve', () => {
  it('stops the alarm the phone reports as ringing', () => {
    expect(stopAlarmTool.resolve?.({}, { device: ringing })).toEqual({ kind: 'action', args: { alarmId: WAKE.id } });
  });

  it('works for a ringing alarm missing from the list (the phone knows it)', () => {
    const device = androidWithAlarms([], { ringingAlarmId: 'alarm-77' });
    expect(stopAlarmTool.resolve?.({}, { device })).toEqual({ kind: 'action', args: { alarmId: 'alarm-77' } });
  });

  it.each([
    ['nothing rings', quiet],
    ['no device info', undefined],
  ])('speaks a fixed reply and does not act when %s', (_label, device) => {
    expect(stopAlarmTool.resolve?.({}, { device })).toEqual({ kind: 'reply', reply: NO_RINGING_ALARM_REPLY });
    expect(NO_RINGING_ALARM_REPLY).toBe("There's no alarm ringing right now.");
  });
});

describe('snoozeAlarmTool.resolve', () => {
  it('snoozes for the default 9 minutes when the user gave no length', () => {
    expect(DEFAULT_SNOOZE_MINUTES).toBe(9);
    expect(snoozeAlarmTool.resolve?.({}, { device: ringing })).toEqual({
      kind: 'action',
      args: { alarmId: WAKE.id, minutes: 9 },
    });
  });

  it('snoozes for the length the user said', () => {
    expect(snoozeAlarmTool.resolve?.({ minutes: 5 }, { device: ringing })).toEqual({
      kind: 'action',
      args: { alarmId: WAKE.id, minutes: 5 },
    });
  });

  it.each([
    ['Snooze', 5, 9],
    ['snooze it', 15, 9],
    ['Five more minutes', 5, 5],
    ['snooze 10', 10, 10],
    ['Snooze for twenty minutes', 20, 20],
    ['give me a minute', 1, 1],
    ['half an hour', 30, 30],
    ['Snooze', undefined, 9],
  ] as const)('%j with model minutes %s → %s', (userText, minutes, expected) => {
    const args = minutes === undefined ? {} : { minutes };
    expect(snoozeAlarmTool.resolve?.(args, { device: ringing, userText })).toEqual({
      kind: 'action',
      args: { alarmId: WAKE.id, minutes: expected },
    });
  });

  it('keeps the validated model minutes when no transcript is passed', () => {
    expect(snoozeMinutes(5, undefined)).toBe(5);
  });

  it.each([
    ['snooze', false],
    ['someone stop it', false],
    ['tennis', false],
    ['10 more', true],
    ['three more minutes', true],
    ['Twelve', true],
  ] as const)('mentionsSnoozeLength(%j) is %s', (text, expected) => {
    expect(mentionsSnoozeLength(text)).toBe(expected);
  });

  it('speaks a fixed reply and does not act when nothing rings', () => {
    expect(snoozeAlarmTool.resolve?.({ minutes: 5 }, { device: quiet })).toEqual({ kind: 'reply', reply: NO_RINGING_ALARM_REPLY });
  });
});
