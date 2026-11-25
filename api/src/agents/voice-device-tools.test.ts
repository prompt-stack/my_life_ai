import { BadRequestError, InternalServerError } from 'groq-sdk';
import { describe, expect, it } from 'vitest';
import { setAlarmTool } from '../tools/set-alarm.js';
import { fakeToolCall, toolUseFailedError } from '../test-utils/groq.js';
import { isToolUseFailed, pickDeviceToolCall, toModelTools, toolResultMessages } from './voice-device-tools.js';

describe('toModelTools', () => {
  it('maps device tools to Chat Completions function tools', () => {
    expect(toModelTools([setAlarmTool])).toEqual([
      {
        type: 'function',
        function: { name: 'setAlarm', description: setAlarmTool.description, parameters: setAlarmTool.parameters },
      },
    ]);
  });
});

describe('pickDeviceToolCall', () => {
  const offered = [setAlarmTool];

  it('returns a validated action for a valid call', () => {
    const outcome = pickDeviceToolCall([fakeToolCall('setAlarm', { hour: 6, minute: 30, label: 'Wake up' })], offered);
    expect(outcome).toEqual({
      kind: 'action',
      action: { callId: 'call_test_1', name: 'setAlarm', args: { hour: 6, minute: 30, label: 'Wake up' } },
    });
  });

  it('takes only the first offered call', () => {
    const outcome = pickDeviceToolCall(
      [fakeToolCall('setAlarm', { hour: 6, minute: 0 }, 'a'), fakeToolCall('setAlarm', { hour: 7, minute: 0 }, 'b')],
      offered,
    );
    expect(outcome).toMatchObject({ kind: 'action', action: { callId: 'a', args: { hour: 6 } } });
  });

  it('replaces an unusable call ID', () => {
    const outcome = pickDeviceToolCall([fakeToolCall('setAlarm', { hour: 6, minute: 0 }, '')], offered);
    expect(outcome).toMatchObject({ kind: 'action', action: { callId: expect.stringMatching(/^call_/) } });
  });

  it.each([
    ['invalid JSON', '{"hour": 6, "minute":'],
    ['out-of-range hour', { hour: 25, minute: 0 }],
    ['a missing minute', { hour: 6 }],
    ['unknown arguments', { hour: 6, minute: 0, repeat: 'daily' }],
    ['a string hour', { hour: '6', minute: 0 }],
  ])('marks %s as invalid', (_label, args) => {
    expect(pickDeviceToolCall([fakeToolCall('setAlarm', args)], offered)).toMatchObject({
      kind: 'invalid',
      tool: setAlarmTool,
    });
  });

  it('ignores calls to tools that were not offered', () => {
    expect(pickDeviceToolCall([fakeToolCall('setAlarm', { hour: 6, minute: 0 })], [])).toEqual({
      kind: 'none',
      ignoredToolNames: ['setAlarm'],
    });
    expect(pickDeviceToolCall(undefined, offered)).toEqual({ kind: 'none', ignoredToolNames: [] });
  });
});

describe('toolResultMessages', () => {
  it('replays the assistant tool call and the phone result', () => {
    expect(
      toolResultMessages({
        callId: 'call_1',
        name: 'setAlarm',
        args: { hour: 6, minute: 30 },
        result: { ok: false, error: 'no_clock_app' },
      }),
    ).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'setAlarm', arguments: '{"hour":6,"minute":30}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"ok":false,"error":"no_clock_app"}' },
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
