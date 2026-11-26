import {
  AlarmSoundIdSchema,
  CreateAlarmArgsSchema,
  DeleteAlarmArgsSchema,
  PreviewAlarmSoundArgsSchema,
  UpdateAlarmArgsSchema,
  type Alarm,
  type DeviceInfo,
} from '@mylife/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { androidWithAlarms, EVENING, testAlarm, WAKE } from '../test-utils/alarms.js';
import { SOUND_ALIAS_HINT, SOUND_QUESTION } from './alarm-model-params.js';
import { createAlarmTool, CreateAlarmModelArgsSchema } from './create-alarm.js';
import { deleteAlarmTool, DeleteAlarmModelArgsSchema, NO_ALARMS_REPLY } from './delete-alarm.js';
import { previewAlarmSoundTool, PreviewAlarmSoundModelArgsSchema } from './preview-alarm-sound.js';
import { ALREADY_SET_REPLY, updateAlarmTool, UpdateAlarmModelArgsSchema } from './update-alarm.js';

/** Drops `description` keys so only the validation rules are compared. */
function withoutDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutDescriptions);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'description')
      .map(([key, inner]) => [key, withoutDescriptions(inner)]),
  );
}

/**
 * The JSON Schema the model should see for a model-args Zod schema. `sound` is
 * a free string in Zod (normalized in code, so "the piano one" still works) but
 * an enum of the five IDs for the model.
 */
function expectedParameters(schema: z.ZodType): unknown {
  const generated = { ...z.toJSONSchema(schema) } as { $schema?: string; properties?: Record<string, unknown> };
  delete generated.$schema;
  if (generated.properties?.sound) {
    generated.properties = { ...generated.properties, sound: { type: 'string', enum: AlarmSoundIdSchema.options } };
  }
  return generated;
}

describe('alarm tool definitions', () => {
  it.each([
    [createAlarmTool, 'createAlarm', 'write', CreateAlarmArgsSchema],
    [updateAlarmTool, 'updateAlarm', 'write', UpdateAlarmArgsSchema],
    [deleteAlarmTool, 'deleteAlarm', 'write', DeleteAlarmArgsSchema],
    [previewAlarmSoundTool, 'previewAlarmSound', 'read', PreviewAlarmSoundArgsSchema],
  ] as const)('%#: %s is an Android + iOS device tool with %s risk', (tool, name, riskLevel, input) => {
    expect(tool).toMatchObject({ name, riskLevel, target: 'device', platforms: ['android', 'ios'] });
    expect(tool.input).toBe(input);
  });

  it.each([
    ['createAlarm', createAlarmTool.parameters, CreateAlarmModelArgsSchema],
    ['updateAlarm', updateAlarmTool.parameters, UpdateAlarmModelArgsSchema],
    ['deleteAlarm', deleteAlarmTool.parameters, DeleteAlarmModelArgsSchema],
    ['previewAlarmSound', previewAlarmSoundTool.parameters, PreviewAlarmSoundModelArgsSchema],
  ] as const)('%s shows the model a JSON Schema that matches its Zod schema', (_name, parameters, schema) => {
    expect(withoutDescriptions(parameters)).toEqual(expectedParameters(schema));
  });

  it('tells the model to leave sound out unless named, without repeating the aliases in each tool', () => {
    for (const tool of [createAlarmTool, updateAlarmTool]) {
      expect(JSON.stringify(tool.parameters)).toContain('Only if the user names a sound.');
    }
    for (const tool of [createAlarmTool, updateAlarmTool, previewAlarmSoundTool]) {
      expect(JSON.stringify(tool.parameters)).not.toContain('xylophone');
    }
  });

  it('lists the distinctive sound aliases in the shortest form', () => {
    expect(SOUND_ALIAS_HINT).toBe(
      'default/normal/regular/standard=sunrise, bells/bell=chimes, xylophone=marimba, keys/keyboard=piano, acoustic/strings=guitar',
    );
  });

  it('never lets the model send alarmId', () => {
    for (const tool of [updateAlarmTool, deleteAlarmTool]) {
      expect(JSON.stringify(tool.parameters)).not.toContain('alarmId');
    }
    expect(DeleteAlarmModelArgsSchema.safeParse({ target: { hour: 6, minute: 30 }, alarmId: 'x' }).success).toBe(false);
    expect(UpdateAlarmModelArgsSchema.safeParse({ target: { hour: 6, minute: 30 }, alarmId: 'x', newHour: 7 }).success).toBe(false);
  });
});

describe('createAlarmTool.resolve', () => {
  type Args = z.infer<typeof CreateAlarmModelArgsSchema>;
  const resolve = (args: Args, device: DeviceInfo | undefined = androidWithAlarms([])) => createAlarmTool.resolve?.(args, { device });

  it('leaves sound out when the user named none (the phone uses the default)', () => {
    expect(resolve({ hour: 6, minute: 0 })).toEqual({ kind: 'action', args: { hour: 6, minute: 0 } });
  });

  it.each([
    ['Piano', 'piano'],
    ['the piano one', 'piano'],
    ['xylophone', 'marimba'],
    ['chimes', 'chimes'],
  ] as const)('normalizes the sound %j to %s', (sound, expected) => {
    expect(resolve({ hour: 6, minute: 0, sound })).toEqual({ kind: 'action', args: { hour: 6, minute: 0, sound: expected } });
  });

  it('asks which sound for a sound it does not know', () => {
    expect(resolve({ hour: 6, minute: 0, sound: 'something calm' })).toEqual({ kind: 'reply', reply: SOUND_QUESTION });
    expect(SOUND_QUESTION).toBe('Which sound: Sunrise, Chimes, Marimba, Piano or Guitar?');
  });

  it('sorts and dedupes weekdays and drops an empty list', () => {
    expect(resolve({ hour: 6, minute: 0, weekdays: [5, 1, 3, 1], label: 'Gym' })).toEqual({
      kind: 'action',
      args: { hour: 6, minute: 0, label: 'Gym', weekdays: [1, 3, 5] },
    });
    expect(resolve({ hour: 6, minute: 0, weekdays: [] })).toEqual({ kind: 'action', args: { hour: 6, minute: 0 } });
  });

  it('says so instead of creating a duplicate of an enabled alarm with the same days', () => {
    expect(resolve({ hour: 6, minute: 30, weekdays: [5, 4, 3, 2, 1] }, androidWithAlarms())).toEqual({
      kind: 'reply',
      reply: 'You already have an alarm at 6:30 AM.',
    });
  });

  it('creates when the same time differs in days or the existing alarm is off', () => {
    expect(resolve({ hour: 6, minute: 30 }, androidWithAlarms())).toMatchObject({ kind: 'action' });
    expect(resolve({ hour: 21, minute: 0 }, androidWithAlarms())).toMatchObject({ kind: 'action' });
  });
});

describe('updateAlarmTool.resolve', () => {
  type Args = z.infer<typeof UpdateAlarmModelArgsSchema>;
  const resolve = (args: Args, alarms: Alarm[] = [WAKE, EVENING]) =>
    updateAlarmTool.resolve?.(args, { device: androidWithAlarms(alarms) });
  const at = (hour: number, minute: number) => ({ hour, minute });

  it('moves an exact match, sending only the new time', () => {
    expect(resolve({ target: at(6, 30), newHour: 7, newMinute: 0 })).toEqual({
      kind: 'action',
      args: { alarmId: 'alarm-1', hour: 7, minute: 0 },
    });
  });

  it('treats a lone newHour as on the hour and a lone newMinute as the same hour', () => {
    expect(resolve({ target: at(6, 30), newHour: 7 })).toEqual({ kind: 'action', args: { alarmId: 'alarm-1', hour: 7, minute: 0 } });
    expect(resolve({ target: at(6, 30), newMinute: 45 })).toEqual({ kind: 'action', args: { alarmId: 'alarm-1', hour: 6, minute: 45 } });
  });

  it('changes only the sound, normalizing aliases', () => {
    expect(resolve({ target: at(6, 30), sound: 'acoustic' })).toEqual({ kind: 'action', args: { alarmId: 'alarm-1', sound: 'guitar' } });
  });

  it('changes label, weekdays and enabled', () => {
    expect(resolve({ target: at(6, 30), label: 'Gym', weekdays: [7, 6], enabled: false })).toEqual({
      kind: 'action',
      args: { alarmId: 'alarm-1', label: 'Gym', weekdays: [6, 7], enabled: false },
    });
  });

  it('turns an alarm that is off back on when its time changes', () => {
    expect(resolve({ target: at(21, 0), newHour: 22, newMinute: 0 })).toEqual({
      kind: 'action',
      args: { alarmId: 'alarm-2', hour: 22, minute: 0, enabled: true },
    });
    expect(resolve({ target: at(21, 0), newHour: 22, newMinute: 0, enabled: false })).toEqual({
      kind: 'action',
      args: { alarmId: 'alarm-2', hour: 22, minute: 0 },
    });
  });

  it('says nothing would change', () => {
    expect(resolve({ target: at(6, 30), newHour: 6, newMinute: 30, sound: 'sunrise', weekdays: [1, 2, 3, 4, 5] })).toEqual({
      kind: 'reply',
      reply: ALREADY_SET_REPLY,
    });
  });

  it('asks what to change when the model sent no change', () => {
    expect(resolve({ target: at(6, 30) })).toEqual({ kind: 'reply', reply: 'What would you like to change about your 6:30 AM alarm?' });
  });

  it.each([
    [{ target: at(6, 0), newHour: 7, newMinute: 0 }, 'Your closest alarm is 6:30 AM. Change that one to 7:00 AM?'],
    [{ target: at(6, 0), sound: 'piano' }, 'Your closest alarm is 6:30 AM. Change that one to Piano?'],
    [{ target: at(6, 0), enabled: false }, 'Your closest alarm is 6:30 AM. Turn that one off?'],
    [{ target: at(22, 0), enabled: true }, 'Your closest alarm is 9:00 PM. Turn that one on?'],
    [{ target: at(6, 0), label: 'Gym' }, 'Your closest alarm is 6:30 AM. Change that one?'],
  ])('asks to confirm the closest alarm: %o', (args, reply) => {
    expect(resolve(args)).toEqual({ kind: 'reply', reply });
  });

  it('says there are no alarms', () => {
    expect(resolve({ target: at(6, 30), newHour: 7 }, [])).toEqual({ kind: 'reply', reply: NO_ALARMS_REPLY });
    expect(updateAlarmTool.resolve?.({ target: at(6, 30), newHour: 7 }, { device: undefined })).toEqual({
      kind: 'reply',
      reply: NO_ALARMS_REPLY,
    });
  });

  it('asks which sound for an unknown sound', () => {
    expect(resolve({ target: at(6, 30), sound: 'something calm' })).toEqual({ kind: 'reply', reply: SOUND_QUESTION });
  });
});

describe('deleteAlarmTool.resolve', () => {
  const resolve = (hour: number, minute: number, alarms: Alarm[] = [WAKE, EVENING]) =>
    deleteAlarmTool.resolve?.({ target: { hour, minute } }, { device: androidWithAlarms(alarms) });

  it('acts with the alarmId on an exact match', () => {
    expect(resolve(21, 0)).toEqual({ kind: 'action', args: { alarmId: 'alarm-2' } });
  });

  it('asks to confirm the closest alarm', () => {
    expect(resolve(6, 0)).toEqual({ kind: 'reply', reply: 'Your closest alarm is 6:30 AM. Delete that one?' });
  });

  it('says there are no alarms', () => {
    expect(resolve(7, 0, [])).toEqual({ kind: 'reply', reply: "You don't have any alarms yet." });
  });

  it('picks the enabled alarm when two share a time', () => {
    const offDuplicate = testAlarm({ id: 'alarm-off', enabled: false, nextTriggerAt: null });
    expect(resolve(6, 30, [offDuplicate, WAKE])).toEqual({ kind: 'action', args: { alarmId: 'alarm-1' } });
  });
});

describe('previewAlarmSoundTool.resolve', () => {
  it('normalizes the sound or asks which one', () => {
    expect(previewAlarmSoundTool.resolve?.({ sound: 'The Marimba' }, { device: undefined })).toEqual({
      kind: 'action',
      args: { sound: 'marimba' },
    });
    expect(previewAlarmSoundTool.resolve?.({ sound: 'jazz' }, { device: undefined })).toEqual({ kind: 'reply', reply: SOUND_QUESTION });
  });
});
