import { BadRequestError, InternalServerError } from 'groq-sdk';
import { describe, expect, it } from 'vitest';
import { androidWithAlarms } from '../test-utils/alarms.js';
import { fakeToolCall, toolUseFailedError } from '../test-utils/groq.js';
import { createAlarmTool } from '../tools/create-alarm.js';
import { deleteAlarmTool } from '../tools/delete-alarm.js';
import { isToolUseFailed, pickDeviceToolCall, toModelTools, toolResultMessages } from './voice-device-tools.js';

describe('toModelTools', () => {
  it('maps device tools to Chat Completions function tools', () => {
    expect(toModelTools([createAlarmTool])).toEqual([
      {
        type: 'function',
        function: { name: 'createAlarm', description: createAlarmTool.description, parameters: createAlarmTool.parameters },
      },
    ]);
  });
});

describe('pickDeviceToolCall', () => {
  const offered = [createAlarmTool];

  it('returns a validated action for a valid call', () => {
    const outcome = pickDeviceToolCall([fakeToolCall('createAlarm', { hour: 6, minute: 30, label: 'Wake up' })], offered);
    expect(outcome).toEqual({
      kind: 'action',
      action: { callId: 'call_test_1', name: 'createAlarm', args: { hour: 6, minute: 30, label: 'Wake up' } },
    });
  });

  it('takes only the first offered call', () => {
    const outcome = pickDeviceToolCall(
      [fakeToolCall('createAlarm', { hour: 6, minute: 0 }, 'a'), fakeToolCall('createAlarm', { hour: 7, minute: 0 }, 'b')],
      offered,
    );
    expect(outcome).toMatchObject({ kind: 'action', action: { callId: 'a', args: { hour: 6 } } });
  });

  it('replaces an unusable call ID', () => {
    const outcome = pickDeviceToolCall([fakeToolCall('createAlarm', { hour: 6, minute: 0 }, '')], offered);
    expect(outcome).toMatchObject({ kind: 'action', action: { callId: expect.stringMatching(/^call_/) } });
  });

  it.each([
    ['invalid JSON', '{"hour": 6, "minute":'],
    ['out-of-range hour', { hour: 25, minute: 0 }],
    ['a missing minute', { hour: 6 }],
    ['unknown arguments', { hour: 6, minute: 0, date: '2026-03-03' }],
    ['a string hour', { hour: '6', minute: 0 }],
    ['weekday 8', { hour: 6, minute: 0, weekdays: [8] }],
    ['a too-long sound', { hour: 6, minute: 0, sound: 'x'.repeat(41) }],
  ])('marks %s as invalid', (_label, args) => {
    expect(pickDeviceToolCall([fakeToolCall('createAlarm', args)], offered)).toMatchObject({
      kind: 'invalid',
      tool: createAlarmTool,
    });
  });

  it('returns a reply outcome when the tool resolves to a question', () => {
    expect(
      pickDeviceToolCall([fakeToolCall('deleteAlarm', { target: { hour: 6, minute: 0 } })], [deleteAlarmTool], androidWithAlarms()),
    ).toEqual({
      kind: 'reply',
      tool: deleteAlarmTool,
      callId: 'call_test_1',
      reply: 'Your closest alarm is 6:30 AM. Delete that one?',
    });
  });

  it('ignores calls to tools that were not offered', () => {
    expect(pickDeviceToolCall([fakeToolCall('createAlarm', { hour: 6, minute: 0 })], [])).toEqual({
      kind: 'none',
      ignoredToolNames: ['createAlarm'],
    });
    expect(pickDeviceToolCall(undefined, offered)).toEqual({ kind: 'none', ignoredToolNames: [] });
  });
});

describe('toolResultMessages', () => {
  it('replays the assistant tool call and the phone result', () => {
    expect(
      toolResultMessages({
        callId: 'call_1',
        name: 'createAlarm',
        args: { hour: 6, minute: 30 },
        result: { ok: false, error: 'permission_required' },
      }),
    ).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'createAlarm', arguments: '{"hour":6,"minute":30}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"ok":false,"error":"permission_required"}' },
    ]);
  });
});

describe('isToolUseFailed', () => {
  it('detects Groq tool_use_failed', () => {
    expect(isToolUseFailed(toolUseFailedError())).toBe(true);
  });

  it.each([
    ['another 400', new BadRequestError(400, { error: { code: 'invalid_model' } }, undefined, new Headers())],
    ['a 500', new InternalServerError(500, { error: { code: 'tool_use_failed' } }, undefined, new Headers())],
    ['a plain error', new Error('tool_use_failed')],
  ])('ignores %s', (_label, err) => {
    expect(isToolUseFailed(err)).toBe(false);
  });
});
