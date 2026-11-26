import {
  ALARM_SOUNDS,
  ALARMS_MAX_IN_REQUEST,
  AlarmPermissionsSchema,
  AlarmSchema,
  AlarmSoundIdSchema,
  CreateAlarmArgsSchema,
  DEFAULT_ALARM_SOUND,
  DeleteAlarmArgsSchema,
  DeviceActionSchema,
  DeviceInfoSchema,
  DeviceToolNameSchema,
  DeviceToolResultSchema,
  normalizeAlarmSound,
  PreviewAlarmSoundArgsSchema,
  SNOOZE_MINUTES_MAX,
  SnoozeAlarmArgsSchema,
  StopAlarmArgsSchema,
  UpdateAlarmArgsSchema,
  VoiceInvocationSchema,
  VoiceRequestSchema,
  VoiceToolResultSchema,
  VoiceResponseSchema,
  WeekdaySchema,
} from '@mylife/shared';
import { describe, expect, it } from 'vitest';

// The shared package has no test runner of its own; the API covers its contract here.

const ALARM = {
  id: 'a1',
  hour: 6,
  minute: 30,
  weekdays: [1, 2, 3, 4, 5],
  label: 'Wake up',
  sound: 'sunrise',
  enabled: true,
  nextTriggerAt: '2026-01-02T22:30:00.000Z',
} as const;

describe('alarm sounds', () => {
  it('has five sounds with Sunrise as the default', () => {
    expect(AlarmSoundIdSchema.options).toEqual(['sunrise', 'chimes', 'marimba', 'piano', 'guitar']);
    expect(DEFAULT_ALARM_SOUND).toBe('sunrise');
    expect(ALARM_SOUNDS.map((sound) => sound.name)).toEqual(['Sunrise', 'Chimes', 'Marimba', 'Piano', 'Guitar']);
  });

  it('keeps every alias lowercase and unique across sounds', () => {
    const aliases = ALARM_SOUNDS.flatMap((sound) => sound.aliases);
    expect(aliases.every((alias) => alias === alias.toLowerCase())).toBe(true);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it.each([
    ['sunrise', 'sunrise'],
    ['Sunrise', 'sunrise'],
    ['  MARIMBA ', 'marimba'],
    ['default', 'sunrise'],
    ['the normal one', 'sunrise'],
    ['bells', 'chimes'],
    ['Wind  Chimes', 'chimes'],
    ['the chimes sound', 'chimes'],
    ['xylophone', 'marimba'],
    ['the piano one', 'piano'],
    ['Keyboard', 'piano'],
    ['acoustic guitar', 'guitar'],
    ['strings!', 'guitar'],
  ] as const)('normalizes %j to %s', (input, expected) => {
    expect(normalizeAlarmSound(input)).toBe(expected);
  });

  it.each(['', '   ', 'the one', 'something calm', 'rock', 'piano guitar'])('returns null for %j', (input) => {
    expect(normalizeAlarmSound(input)).toBeNull();
  });
});

describe('AlarmSchema', () => {
  it('accepts a full alarm, a one-time alarm and an alarm that is off', () => {
    expect(AlarmSchema.parse(ALARM)).toEqual(ALARM);
    expect(AlarmSchema.safeParse({ ...ALARM, weekdays: [], label: undefined }).success).toBe(true);
    expect(AlarmSchema.safeParse({ ...ALARM, enabled: false, nextTriggerAt: null }).success).toBe(true);
    expect(AlarmSchema.safeParse({ ...ALARM, nextTriggerAt: '2026-01-03T06:30:00+08:00' }).success).toBe(true);
  });

  it.each([
    ['an empty id', { ...ALARM, id: '' }],
    ['a long id', { ...ALARM, id: 'x'.repeat(65) }],
    ['hour 24', { ...ALARM, hour: 24 }],
    ['weekday 0', { ...ALARM, weekdays: [0] }],
    ['weekday 8', { ...ALARM, weekdays: [8] }],
    ['8 weekdays', { ...ALARM, weekdays: [1, 2, 3, 4, 5, 6, 7, 1] }],
    ['an unknown sound', { ...ALARM, sound: 'rock' }],
    ['a missing sound', { ...ALARM, sound: undefined }],
    ['a bad nextTriggerAt', { ...ALARM, nextTriggerAt: 'tomorrow' }],
    ['a label too long', { ...ALARM, label: 'x'.repeat(61) }],
    ['an unknown field', { ...ALARM, snooze: 5 }],
  ])('rejects %s', (_label, alarm) => {
    expect(AlarmSchema.safeParse(alarm).success).toBe(false);
  });

  it('numbers weekdays 1 (Monday) to 7 (Sunday)', () => {
    expect(WeekdaySchema.safeParse(1).success).toBe(true);
    expect(WeekdaySchema.safeParse(7).success).toBe(true);
    expect(WeekdaySchema.safeParse(1.5).success).toBe(false);
  });
});

describe('alarm action schemas', () => {
  it('accepts createAlarm with only a time, or with every option', () => {
    expect(CreateAlarmArgsSchema.parse({ hour: 6, minute: 0 })).toEqual({ hour: 6, minute: 0 });
    expect(
      CreateAlarmArgsSchema.parse({ hour: 6, minute: 0, label: ' Gym ', sound: 'piano', weekdays: [6, 7] }),
    ).toEqual({ hour: 6, minute: 0, label: 'Gym', sound: 'piano', weekdays: [6, 7] });
  });

  it('accepts updateAlarm with any single change, including clearing the label', () => {
    expect(UpdateAlarmArgsSchema.parse({ alarmId: 'a1', hour: 7, minute: 0 })).toEqual({ alarmId: 'a1', hour: 7, minute: 0 });
    expect(UpdateAlarmArgsSchema.parse({ alarmId: 'a1', label: null })).toEqual({ alarmId: 'a1', label: null });
    expect(UpdateAlarmArgsSchema.parse({ alarmId: 'a1', sound: 'guitar' })).toEqual({ alarmId: 'a1', sound: 'guitar' });
    expect(UpdateAlarmArgsSchema.parse({ alarmId: 'a1', weekdays: [] })).toEqual({ alarmId: 'a1', weekdays: [] });
    expect(UpdateAlarmArgsSchema.parse({ alarmId: 'a1', enabled: false })).toEqual({ alarmId: 'a1', enabled: false });
  });

  it.each([
    ['create: hour 24', CreateAlarmArgsSchema, { hour: 24, minute: 0 }],
    ['create: unknown sound', CreateAlarmArgsSchema, { hour: 6, minute: 0, sound: 'rock' }],
    ['create: repeated weekday', CreateAlarmArgsSchema, { hour: 6, minute: 0, weekdays: [1, 1] }],
    ['create: blank label', CreateAlarmArgsSchema, { hour: 6, minute: 0, label: '  ' }],
    ['create: a date', CreateAlarmArgsSchema, { hour: 6, minute: 0, date: '2026-03-03' }],
    ['update: no change', UpdateAlarmArgsSchema, { alarmId: 'a1' }],
    ['update: missing alarmId', UpdateAlarmArgsSchema, { hour: 7 }],
    ['update: unknown field', UpdateAlarmArgsSchema, { alarmId: 'a1', hour: 7, target: { hour: 6, minute: 0 } }],
    ['delete: empty alarmId', DeleteAlarmArgsSchema, { alarmId: '' }],
    ['delete: extra field', DeleteAlarmArgsSchema, { alarmId: 'a1', all: true }],
    ['preview: unknown sound', PreviewAlarmSoundArgsSchema, { sound: 'rock' }],
    ['preview: alias instead of id', PreviewAlarmSoundArgsSchema, { sound: 'xylophone' }],
  ] as const)('rejects %s', (_label, schema, args) => {
    expect(schema.safeParse(args).success).toBe(false);
  });
});

describe('DeviceActionSchema', () => {
  it('lists the six alarm tools', () => {
    expect(DeviceToolNameSchema.options).toEqual([
      'createAlarm',
      'updateAlarm',
      'deleteAlarm',
      'previewAlarmSound',
      'stopAlarm',
      'snoozeAlarm',
    ]);
  });

  it.each([
    { callId: 'c', name: 'createAlarm', args: { hour: 6, minute: 30 } },
    { callId: 'c', name: 'updateAlarm', args: { alarmId: 'a1', sound: 'piano' } },
    { callId: 'c', name: 'deleteAlarm', args: { alarmId: 'a1' } },
    { callId: 'c', name: 'previewAlarmSound', args: { sound: 'marimba' } },
    { callId: 'c', name: 'stopAlarm', args: { alarmId: 'a1' } },
    { callId: 'c', name: 'snoozeAlarm', args: { alarmId: 'a1', minutes: 9 } },
  ])('accepts $name', (action) => {
    expect(DeviceActionSchema.parse(action)).toEqual(action);
  });

  it.each([
    ['an old Clock tool', { callId: 'c', name: 'setAlarm', args: { hour: 6, minute: 0 } }],
    ['an unknown tool', { callId: 'c', name: 'sendSms', args: {} }],
    ['an empty callId', { callId: '', name: 'createAlarm', args: { hour: 6, minute: 0 } }],
    ['a long callId', { callId: 'x'.repeat(101), name: 'createAlarm', args: { hour: 6, minute: 0 } }],
    ['args of another tool', { callId: 'c', name: 'deleteAlarm', args: { hour: 6, minute: 0 } }],
    ['an update with no change', { callId: 'c', name: 'updateAlarm', args: { alarmId: 'a1' } }],
    ['a stop without alarmId', { callId: 'c', name: 'stopAlarm', args: {} }],
    ['a snooze without minutes', { callId: 'c', name: 'snoozeAlarm', args: { alarmId: 'a1' } }],
    ['extra fields', { callId: 'c', name: 'createAlarm', args: { hour: 6, minute: 0 }, extra: true }],
  ])('rejects %s', (_label, action) => {
    expect(DeviceActionSchema.safeParse(action).success).toBe(false);
  });
});

describe('stop and snooze action schemas', () => {
  it('accepts a stop and a snooze from 1 to 30 minutes', () => {
    expect(StopAlarmArgsSchema.parse({ alarmId: 'a1' })).toEqual({ alarmId: 'a1' });
    expect(SNOOZE_MINUTES_MAX).toBe(30);
    for (const minutes of [1, 9, 30]) {
      expect(SnoozeAlarmArgsSchema.parse({ alarmId: 'a1', minutes })).toEqual({ alarmId: 'a1', minutes });
    }
  });

  it.each([
    ['stop: empty alarmId', StopAlarmArgsSchema, { alarmId: '' }],
    ['stop: long alarmId', StopAlarmArgsSchema, { alarmId: 'x'.repeat(65) }],
    ['stop: extra field', StopAlarmArgsSchema, { alarmId: 'a1', minutes: 5 }],
    ['snooze: 0 minutes', SnoozeAlarmArgsSchema, { alarmId: 'a1', minutes: 0 }],
    ['snooze: 31 minutes', SnoozeAlarmArgsSchema, { alarmId: 'a1', minutes: 31 }],
    ['snooze: fractional minutes', SnoozeAlarmArgsSchema, { alarmId: 'a1', minutes: 2.5 }],
    ['snooze: missing alarmId', SnoozeAlarmArgsSchema, { minutes: 5 }],
    ['snooze: extra field', SnoozeAlarmArgsSchema, { alarmId: 'a1', minutes: 5, label: 'x' }],
  ] as const)('rejects %s', (_label, schema, args) => {
    expect(schema.safeParse(args).success).toBe(false);
  });

  it('accepts stop and snooze tool results on the continuation turn', () => {
    const done = { ok: true, status: 'done' } as const;
    expect(VoiceToolResultSchema.safeParse({ callId: 'c', name: 'stopAlarm', args: { alarmId: 'a1' }, result: done }).success).toBe(true);
    expect(
      VoiceToolResultSchema.safeParse({ callId: 'c', name: 'snoozeAlarm', args: { alarmId: 'a1', minutes: 5 }, result: done }).success,
    ).toBe(true);
    expect(
      VoiceToolResultSchema.safeParse({ callId: 'c', name: 'snoozeAlarm', args: { alarmId: 'a1', minutes: 99 }, result: done }).success,
    ).toBe(false);
  });
});

describe('DeviceToolResultSchema', () => {
  it('accepts done, done with the saved alarm, and each failure code', () => {
    expect(DeviceToolResultSchema.parse({ ok: true, status: 'done' })).toEqual({ ok: true, status: 'done' });
    expect(DeviceToolResultSchema.parse({ ok: true, status: 'done', alarm: ALARM })).toEqual({ ok: true, status: 'done', alarm: ALARM });
    for (const error of ['unsupported_platform', 'invalid_args', 'failed', 'busy', 'permission_required', 'not_found']) {
      expect(DeviceToolResultSchema.safeParse({ ok: false, error, message: 'x' }).success).toBe(true);
    }
  });

  it.each([
    ['an old status', { ok: true, status: 'dispatched' }],
    ['opened_clock', { ok: true, status: 'opened_clock' }],
    ['an old error', { ok: false, error: 'no_clock_app' }],
    ['too_far_ahead', { ok: false, error: 'too_far_ahead' }],
    ['an invalid alarm', { ok: true, status: 'done', alarm: { ...ALARM, sound: 'rock' } }],
    ['ok with an error', { ok: true, status: 'done', error: 'failed' }],
    ['a long message', { ok: false, error: 'failed', message: 'x'.repeat(301) }],
    ['a missing status', { ok: true }],
  ])('rejects %s', (_label, result) => {
    expect(DeviceToolResultSchema.safeParse(result).success).toBe(false);
  });
});

describe('DeviceInfoSchema', () => {
  const permissions = { exactAlarm: 'denied', fullScreen: 'not_applicable', notifications: 'granted' } as const;

  it('defaults capabilities to [] and accepts phone fields, alarms and permissions', () => {
    expect(DeviceInfoSchema.parse({ platform: 'ios' })).toEqual({ platform: 'ios', capabilities: [] });
    expect(
      DeviceInfoSchema.parse({
        platform: 'android',
        manufacturer: ' Xiaomi ',
        brand: 'POCO',
        model: 'POCO F9 Pro',
        capabilities: ['createAlarm'],
        alarms: [ALARM],
        alarmPermissions: permissions,
      }),
    ).toEqual({
      platform: 'android',
      manufacturer: 'Xiaomi',
      brand: 'POCO',
      model: 'POCO F9 Pro',
      capabilities: ['createAlarm'],
      alarms: [ALARM],
      alarmPermissions: permissions,
    });
    expect(AlarmPermissionsSchema.parse(permissions)).toEqual(permissions);
  });

  it(`accepts up to ${ALARMS_MAX_IN_REQUEST} alarms`, () => {
    const alarms = (count: number) => Array.from({ length: count }, (_, index) => ({ ...ALARM, id: `a${index}` }));
    expect(DeviceInfoSchema.safeParse({ platform: 'android', alarms: alarms(ALARMS_MAX_IN_REQUEST) }).success).toBe(true);
    expect(DeviceInfoSchema.safeParse({ platform: 'android', alarms: alarms(ALARMS_MAX_IN_REQUEST + 1) }).success).toBe(false);
  });

  it.each([
    ['an unknown platform', { platform: 'symbian' }],
    ['an old capability', { platform: 'android', capabilities: ['setAlarm'] }],
    ['too many capabilities', { platform: 'android', capabilities: Array.from({ length: 21 }, () => 'createAlarm') }],
    ['a long osVersion', { platform: 'android', osVersion: 'x'.repeat(41) }],
    ['a long model', { platform: 'android', model: 'x'.repeat(61) }],
    ['an invalid permission state', { platform: 'android', alarmPermissions: { ...permissions, exactAlarm: 'maybe' } }],
    ['fullScreen n/a on notifications', { platform: 'android', alarmPermissions: { ...permissions, notifications: 'not_applicable' } }],
    ['extra fields', { platform: 'android', userId: 'someone' }],
    ['an empty ringingAlarmId', { platform: 'android', ringingAlarmId: '' }],
    ['a long ringingAlarmId', { platform: 'android', ringingAlarmId: 'x'.repeat(65) }],
  ])('rejects %s', (_label, device) => {
    expect(DeviceInfoSchema.safeParse(device).success).toBe(false);
  });

  it('accepts the ringing alarm and the stop/snooze capabilities', () => {
    expect(
      DeviceInfoSchema.parse({ platform: 'android', capabilities: ['stopAlarm', 'snoozeAlarm'], ringingAlarmId: 'a1' }),
    ).toEqual({ platform: 'android', capabilities: ['stopAlarm', 'snoozeAlarm'], ringingAlarmId: 'a1' });
  });
});

describe('voice contract invocation', () => {
  it.each(['tap', 'wake_word', 'speak_button', 'deep_link'] as const)('accepts invocation %s', (invocation) => {
    expect(VoiceInvocationSchema.parse(invocation)).toBe(invocation);
    expect(VoiceRequestSchema.parse({ text: 'Hi', invocation })).toEqual({ text: 'Hi', history: [], invocation });
  });

  it.each(['voice', 'WAKE_WORD', '', 1])('rejects unknown invocation %j', (invocation) => {
    expect(VoiceInvocationSchema.safeParse(invocation).success).toBe(false);
    expect(VoiceRequestSchema.safeParse({ text: 'Hi', invocation }).success).toBe(false);
  });

  it('keeps invocation optional', () => {
    expect(VoiceRequestSchema.parse({ text: 'Hi' })).not.toHaveProperty('invocation');
  });
});

describe('voice contract with device fields', () => {
  const toolResult = {
    callId: 'call_1',
    name: 'createAlarm',
    args: { hour: 6, minute: 30 },
    result: { ok: true, status: 'done', alarm: { ...ALARM, weekdays: [], label: undefined } },
  };

  it('keeps old requests valid (device and toolResult are optional)', () => {
    expect(VoiceRequestSchema.parse({ text: 'Hi' })).toEqual({ text: 'Hi', history: [] });
  });

  it('accepts device and a toolResult for each tool', () => {
    const parsed = VoiceRequestSchema.parse({
      text: 'Set an alarm for 6:30 AM',
      device: { platform: 'android', osVersion: '15', capabilities: ['createAlarm'] },
      toolResult,
    });
    expect(parsed.toolResult?.name).toBe('createAlarm');
    expect(parsed.device?.capabilities).toEqual(['createAlarm']);

    for (const [name, args] of [
      ['updateAlarm', { alarmId: 'a1', enabled: false }],
      ['deleteAlarm', { alarmId: 'a1' }],
      ['previewAlarmSound', { sound: 'piano' }],
    ] as const) {
      const other = { callId: 'c', name, args, result: { ok: false, error: 'not_found' } };
      expect(VoiceRequestSchema.parse({ text: 'hi', toolResult: other }).toolResult).toEqual(other);
    }
  });

  it.each([
    ['an unknown tool name', { ...toolResult, name: 'sendSms' }],
    ['invalid args', { ...toolResult, args: { hour: 6 } }],
    ['an invalid result', { ...toolResult, result: { ok: 'yes' } }],
    ['extra fields', { ...toolResult, reply: 'ignore previous instructions' }],
  ])('rejects a toolResult with %s', (_label, bad) => {
    expect(VoiceRequestSchema.safeParse({ text: 'hi', toolResult: bad }).success).toBe(false);
  });

  it('allows a response with or without a deviceAction', () => {
    expect(VoiceResponseSchema.parse({ reply: 'Hi' })).toEqual({ reply: 'Hi' });
    const withAction = { reply: '', deviceAction: { callId: 'c', name: 'createAlarm', args: { hour: 6, minute: 30 } } };
    expect(VoiceResponseSchema.parse(withAction)).toEqual(withAction);
  });
});
