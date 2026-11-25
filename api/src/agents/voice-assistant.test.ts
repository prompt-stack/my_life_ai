import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from 'groq-sdk';
import { describe, expect, it } from 'vitest';
import { AiNotConfiguredError, AppError } from '../lib/errors.js';
import { fakeCompletion, fakeModelClient, fakeToolCall, toolUseFailedError } from '../test-utils/groq.js';
import { silentLogger } from '../test-utils/app.js';
import { setAlarmTool } from '../tools/set-alarm.js';
import {
  DEVICE_DONE_REPLY,
  DEVICE_FAILED_REPLY,
  EMPTY_REPLY,
  formatDeviceContext,
  formatTimeContext,
  generateVoiceReply,
  REFUSAL_REPLY,
  stripReasoning,
  toMessageParams,
  TOOL_TROUBLE_REPLY,
  VOICE_SYSTEM_PROMPT,
  VOICE_TEMPERATURE,
  type VoiceAssistantDeps,
  type VoiceReplyInput,
} from './voice-assistant.js';

const NOW = new Date('2026-01-02T01:30:00.000Z');
const config: VoiceAssistantDeps['config'] = { model: 'openai/gpt-oss-20b', maxTokens: 1024, reasoningEffort: 'low' };
const nonReasoningConfig: VoiceAssistantDeps['config'] = { model: 'some-chat-model', maxTokens: 512, reasoningEffort: 'off' };
const TIME = 'TIME CONTEXT';

function input(overrides: Partial<VoiceReplyInput> = {}): VoiceReplyInput {
  return { text: 'What time is it?', history: [], timezone: 'Asia/Manila', now: NOW, requestId: 'req-1', ...overrides };
}

async function expectAppError(promise: Promise<unknown>, statusCode: number, code: string): Promise<void> {
  const err: unknown = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ statusCode, code });
}

describe('formatTimeContext', () => {
  it('renders local time in the given timezone plus UTC', () => {
    const text = formatTimeContext(NOW, 'Asia/Manila');
    expect(text).toContain('Friday, January 2, 2026');
    expect(text).toContain('9:30');
    expect(text).toContain('(Asia/Manila)');
    expect(text).toContain('2026-01-02T01:30:00.000Z');
  });
});

describe('toMessageParams', () => {
  it('puts the stable prompt first, then the time, then history and the new user turn', () => {
    expect(
      toMessageParams(
        [
          { role: 'user', text: 'Hi' },
          { role: 'assistant', text: 'Hello!' },
        ],
        'How are you?',
        TIME,
      ),
    ).toEqual([
      { role: 'system', content: VOICE_SYSTEM_PROMPT },
      { role: 'system', content: TIME },
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'How are you?' },
    ]);
  });

  it('drops leading assistant turns so the conversation starts with the user', () => {
    expect(toMessageParams([{ role: 'assistant', text: 'Welcome!' }], 'Hi', TIME)).toEqual([
      { role: 'system', content: VOICE_SYSTEM_PROMPT },
      { role: 'system', content: TIME },
      { role: 'user', content: 'Hi' },
    ]);
  });
});

describe('stripReasoning', () => {
  it.each([
    ['plain text', 'It is nine thirty.', 'It is nine thirty.'],
    ['a think block', '<think>The user wants the time.</think>\n\nIt is nine thirty.', 'It is nine thirty.'],
    ['multiple blocks, any case', '<THINK>a</THINK>Hi <think>b\nc</think>there.', 'Hi there.'],
    ['a missing opening tag', 'reasoning here</think> It is nine.', 'It is nine.'],
    ['a block cut off by max tokens', 'Sure. <think>still thinking', 'Sure.'],
    ['only reasoning', '<think>hmm</think>', ''],
  ])('handles %s', (_name, content, expected) => {
    expect(stripReasoning(content)).toBe(expected);
  });
});

describe('generateVoiceReply', () => {
  it('sends model, max_completion_tokens, temperature, reasoning params and system + time + turns', async () => {
    const { client, create } = fakeModelClient();

    await generateVoiceReply(input({ history: [{ role: 'user', text: 'Hi' }, { role: 'assistant', text: 'Hey!' }] }), {
      client,
      config,
      logger: silentLogger,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toEqual({
      model: 'openai/gpt-oss-20b',
      max_completion_tokens: 1024,
      temperature: VOICE_TEMPERATURE,
      reasoning_effort: 'low',
      include_reasoning: false,
      messages: [
        { role: 'system', content: VOICE_SYSTEM_PROMPT },
        { role: 'system', content: formatTimeContext(NOW, 'Asia/Manila') },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hey!' },
        { role: 'user', content: 'What time is it?' },
      ],
    });
  });

  it('omits reasoning params when reasoning effort is off', async () => {
    const { client, create } = fakeModelClient();

    await generateVoiceReply(input(), { client, config: nonReasoningConfig, logger: silentLogger });

    const params = create.mock.calls[0]?.[0];
    expect(params).toMatchObject({ model: 'some-chat-model', max_completion_tokens: 512 });
    expect(params).not.toHaveProperty('reasoning_effort');
    expect(params).not.toHaveProperty('include_reasoning');
    expect(params).not.toHaveProperty('reasoning_format');
    expect(params).not.toHaveProperty('tools');
  });

  it('sends the configured reasoning effort with include_reasoning false and never reasoning_format', async () => {
    const { client, create } = fakeModelClient();

    await generateVoiceReply(input(), {
      client,
      config: { model: 'openai/gpt-oss-120b', maxTokens: 256, reasoningEffort: 'high' },
      logger: silentLogger,
    });

    const params = create.mock.calls[0]?.[0];
    expect(params).toMatchObject({
      model: 'openai/gpt-oss-120b',
      max_completion_tokens: 256,
      reasoning_effort: 'high',
      include_reasoning: false,
    });
    expect(params).not.toHaveProperty('reasoning_format');
  });

  it('trims the reply', async () => {
    const { client } = fakeModelClient(() => Promise.resolve(fakeCompletion({ content: '  It is 9:30 AM.  ' })));

    await expect(generateVoiceReply(input(), { client, config, logger: silentLogger })).resolves.toEqual({ reply: 'It is 9:30 AM.' });
  });

  it('strips <think> blocks before the reply is spoken', async () => {
    const { client } = fakeModelClient(() =>
      Promise.resolve(fakeCompletion({ content: '<think>User asks the time.</think>It is half past nine.' })),
    );

    await expect(generateVoiceReply(input(), { client, config, logger: silentLogger })).resolves.toEqual({
      reply: 'It is half past nine.',
    });
  });

  it('returns a short spoken apology when the content filter stops the reply', async () => {
    const { client } = fakeModelClient(() =>
      Promise.resolve(fakeCompletion({ content: null, finishReason: 'content_filter' })),
    );

    await expect(generateVoiceReply(input(), { client, config, logger: silentLogger })).resolves.toEqual({ reply: REFUSAL_REPLY });
  });

  it.each([
    ['blank content', fakeCompletion({ content: '   ' })],
    ['null content', fakeCompletion({ content: null })],
    ['only reasoning', fakeCompletion({ content: '<think>hmm</think>' })],
    ['reasoning exhausted max tokens', fakeCompletion({ content: '', finishReason: 'length' })],
    ['no choices', fakeCompletion({ noChoices: true })],
  ])('returns a fallback for %s', async (_name, completion) => {
    const { client } = fakeModelClient(() => Promise.resolve(completion));

    await expect(generateVoiceReply(input(), { client, config, logger: silentLogger })).resolves.toEqual({ reply: EMPTY_REPLY });
  });

  it('throws ai_not_configured without calling anything when no client is configured', async () => {
    await expect(generateVoiceReply(input(), { client: undefined, config, logger: silentLogger })).rejects.toBeInstanceOf(
      AiNotConfiguredError,
    );
  });

  it('passes the abort signal to the SDK', async () => {
    const { client, create } = fakeModelClient();
    const controller = new AbortController();

    await generateVoiceReply(input({ signal: controller.signal }), { client, config, logger: silentLogger });

    expect(create.mock.calls[0]?.[1]).toEqual({ signal: controller.signal });
  });

  it.each([
    ['rate limit', () => new RateLimitError(429, undefined, 'rate limited', new Headers()), 429, 'ai_rate_limited'],
    ['timeout', () => new APIConnectionTimeoutError(), 504, 'ai_timeout'],
    ['connection error', () => new APIConnectionError({ message: 'socket hang up' }), 502, 'ai_upstream_error'],
    ['bad key', () => new AuthenticationError(401, undefined, 'invalid api key', new Headers()), 502, 'ai_upstream_error'],
    ['forbidden', () => new PermissionDeniedError(403, undefined, 'forbidden', new Headers()), 502, 'ai_upstream_error'],
    ['unknown model', () => new NotFoundError(404, undefined, 'model not found', new Headers()), 502, 'ai_upstream_error'],
    ['bad parameter', () => new BadRequestError(400, undefined, 'bad param', new Headers()), 502, 'ai_upstream_error'],
    ['server error', () => new InternalServerError(500, undefined, 'boom', new Headers()), 502, 'ai_upstream_error'],
    ['client abort', () => new APIUserAbortError(), 502, 'ai_upstream_error'],
    ['non-SDK error', () => new Error('unexpected'), 502, 'ai_upstream_error'],
  ] as const)('maps %s to %i %s', async (_name, makeError, statusCode, code) => {
    const { client } = fakeModelClient(() => Promise.reject(makeError()));

    await expectAppError(generateVoiceReply(input(), { client, config, logger: silentLogger }), statusCode, code);
  });
});

const ANDROID = { platform: 'android', osVersion: '15', capabilities: ['setAlarm'] } as const satisfies VoiceReplyInput['device'];
const IPHONE = { platform: 'ios', osVersion: '26.1', capabilities: [] } as const satisfies VoiceReplyInput['device'];
const deps = (client: VoiceAssistantDeps['client']): VoiceAssistantDeps => ({ client, config, logger: silentLogger });

function alarmInput(overrides: Partial<VoiceReplyInput> = {}): VoiceReplyInput {
  return input({ text: 'Set an alarm for 6:30 AM', device: { ...ANDROID, capabilities: [...ANDROID.capabilities] }, ...overrides });
}

describe('VOICE_SYSTEM_PROMPT alarm rules', () => {
  it.each([
    ['tools depend on the phone', /depends on the phone/],
    ['never claim success without a tool result', /Never say you did something on the phone unless a tool result says it succeeded/],
    ['honest iPhone answer', /I can't set alarms on iPhone yet/],
    ['no time questions when alarms are unavailable', /do not ask any questions about the time/],
    ['AM/PM in any form is complete', /\(AM, am, a\.m\., PM, pm, p\.m\.\) is complete/],
    ['never ask AM or PM when given', /never ask "AM or PM\?"/],
    ['ask for a missing time', /for "set an alarm", ask what time/],
    ['ask AM or PM only when missing', /no AM or PM and nothing else settles it.*"7 AM or 7 PM\?"/],
    ['example: 7 AM', /"Set an alarm for 7 AM" means setAlarm with hour 7, minute 0/],
    ['example: 7 p.m.', /"Alarm at 7 p\.m\." means hour 19/],
    ['unambiguous times', /noon, midnight/],
    ['relative times from the current local time', /in 20 minutes.*current local time/],
    ['next occurrence only', /next time that clock time comes around/],
    ['no repeating alarms', /Repeating alarms are not supported yet/],
    ['short label', /short label/],
    ['12-hour confirmation', /12-hour spoken form/],
  ])('includes: %s', (_label, pattern) => {
    expect(VOICE_SYSTEM_PROMPT).toMatch(pattern);
  });

  it('checks availability before AM/PM clarification', () => {
    const unavailable = VOICE_SYSTEM_PROMPT.indexOf('If the setAlarm tool is not provided');
    const complete = VOICE_SYSTEM_PROMPT.indexOf('is complete: call setAlarm');
    const ask = VOICE_SYSTEM_PROMPT.indexOf('Ask a question only if');
    expect(unavailable).toBeGreaterThan(-1);
    expect(unavailable).toBeLessThan(complete);
    expect(complete).toBeLessThan(ask);
  });
});

describe('formatDeviceContext', () => {
  it('names the platform, or returns undefined without device info', () => {
    expect(formatDeviceContext({ platform: 'ios', capabilities: [] })).toBe('The user is talking to you on an iPhone.');
    expect(formatDeviceContext({ platform: 'android', capabilities: [] })).toContain('an Android phone');
    expect(formatDeviceContext(undefined)).toBeUndefined();
  });

  it('lists the available phone tools, or says plainly there are none', () => {
    expect(formatDeviceContext({ platform: 'android', capabilities: ['setAlarm'] }, ['setAlarm'])).toBe(
      'The user is talking to you on an Android phone. Phone tools available on this phone: setAlarm.',
    );
    expect(formatDeviceContext({ platform: 'ios', capabilities: [] }, [])).toBe(
      'The user is talking to you on an iPhone. No phone tools are available on this phone, so you cannot set alarms here.',
    );
  });
});

describe('generateVoiceReply with device tools', () => {
  it('offers setAlarm (auto, no parallel calls) to an Android phone with the capability', async () => {
    const { client, create } = fakeModelClient();

    await generateVoiceReply(alarmInput(), deps(client));

    const params = create.mock.calls[0]?.[0];
    expect(params).toMatchObject({ tool_choice: 'auto', parallel_tool_calls: false });
    expect(params?.tools).toEqual([
      { type: 'function', function: { name: 'setAlarm', description: setAlarmTool.description, parameters: setAlarmTool.parameters } },
    ]);
    expect(params?.messages[1]).toEqual({
      role: 'system',
      content: `${formatTimeContext(NOW, 'Asia/Manila')}\nThe user is talking to you on an Android phone. Phone tools available on this phone: setAlarm.`,
    });
  });

  it.each([
    ['an iPhone', { device: IPHONE }],
    ['an iPhone claiming the capability', { device: { platform: 'ios' as const, capabilities: ['setAlarm' as const] } }],
    ['Android without the capability', { device: { platform: 'android' as const, capabilities: [] } }],
    ['no device info', { device: undefined }],
  ])('offers no tools to %s', async (_label, overrides) => {
    const { client, create } = fakeModelClient();

    await generateVoiceReply(alarmInput(overrides), deps(client));

    const params = create.mock.calls[0]?.[0];
    expect(params).not.toHaveProperty('tools');
    expect(params).not.toHaveProperty('tool_choice');
    expect(params).not.toHaveProperty('parallel_tool_calls');
  });

  it('tells the model it is on an iPhone so it can explain alarms are unavailable', async () => {
    const { client, create } = fakeModelClient();

    await generateVoiceReply(alarmInput({ device: IPHONE }), deps(client));

    expect(create.mock.calls[0]?.[0].messages[1]).toMatchObject({
      content: expect.stringContaining('on an iPhone. No phone tools are available on this phone'),
    });
  });

  it('returns a deviceAction for a valid setAlarm call', async () => {
    const { client } = fakeModelClient(() =>
      Promise.resolve(fakeCompletion({ content: null, toolCalls: [fakeToolCall('setAlarm', { hour: 6, minute: 30, label: 'Wake up' })] })),
    );

    await expect(generateVoiceReply(alarmInput(), deps(client))).resolves.toEqual({
      reply: '',
      deviceAction: { callId: 'call_test_1', name: 'setAlarm', args: { hour: 6, minute: 30, label: 'Wake up' } },
    });
  });

  it('keeps any model text alongside the action', async () => {
    const { client } = fakeModelClient(() =>
      Promise.resolve(fakeCompletion({ content: 'Setting it now.', toolCalls: [fakeToolCall('setAlarm', { hour: 18, minute: 0 })] })),
    );

    const result = await generateVoiceReply(alarmInput(), deps(client));

    expect(result).toMatchObject({ reply: 'Setting it now.', deviceAction: { args: { hour: 18, minute: 0 } } });
  });

  it.each([
    ['unparseable JSON', '{"hour":6,'],
    ['an out-of-range hour', { hour: 30, minute: 0 }],
    ['an out-of-range minute', { hour: 6, minute: 75 }],
    ['an extra argument', { hour: 6, minute: 0, date: '2026-01-09' }],
  ])('asks for the time instead of acting on %s', async (_label, args) => {
    const { client } = fakeModelClient(() =>
      Promise.resolve(fakeCompletion({ content: null, toolCalls: [fakeToolCall('setAlarm', args)] })),
    );

    const result = await generateVoiceReply(alarmInput(), deps(client));

    expect(result).toEqual({ reply: setAlarmTool.clarificationReply });
    expect(result).not.toHaveProperty('deviceAction');
  });

  it('never emits an action for a tool that was not offered', async () => {
    const { client } = fakeModelClient(() =>
      Promise.resolve(fakeCompletion({ content: 'Okay.', toolCalls: [fakeToolCall('setAlarm', { hour: 6, minute: 0 })] })),
    );

    await expect(generateVoiceReply(alarmInput({ device: IPHONE }), deps(client))).resolves.toEqual({ reply: 'Okay.' });
  });

  it('retries once on tool_use_failed and returns the second answer', async () => {
    const { client, create } = fakeModelClient();
    create
      .mockImplementationOnce(() => Promise.reject(toolUseFailedError()))
      .mockImplementationOnce(() =>
        Promise.resolve(fakeCompletion({ content: null, toolCalls: [fakeToolCall('setAlarm', { hour: 6, minute: 0 })] })),
      );

    const result = await generateVoiceReply(alarmInput(), deps(client));

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.deviceAction).toEqual({ callId: 'call_test_1', name: 'setAlarm', args: { hour: 6, minute: 0 } });
  });

  it('speaks an apology when tool_use_failed happens twice', async () => {
    const { client, create } = fakeModelClient(() => Promise.reject(toolUseFailedError()));

    await expect(generateVoiceReply(alarmInput(), deps(client))).resolves.toEqual({ reply: TOOL_TROUBLE_REPLY });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('does not retry other 400s', async () => {
    const { client, create } = fakeModelClient(() =>
      Promise.reject(new BadRequestError(400, { error: { code: 'model_decommissioned' } }, 'gone', new Headers())),
    );

    await expectAppError(generateVoiceReply(alarmInput(), deps(client)), 502, 'ai_upstream_error');
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('generateVoiceReply continuation (toolResult)', () => {
  const okResult = {
    callId: 'call_abc',
    name: 'setAlarm',
    args: { hour: 6, minute: 30 },
    result: { ok: true, status: 'dispatched' },
  } as const satisfies VoiceReplyInput['toolResult'];

  it('replays the tool call and result, sends no tools, and returns only the spoken reply', async () => {
    const { client, create } = fakeModelClient(() =>
      Promise.resolve(fakeCompletion({ content: 'Done, your alarm is set for 6:30 AM.' })),
    );
    const history = [
      { role: 'user' as const, text: 'Hi' },
      { role: 'assistant' as const, text: 'Hello!' },
    ];

    const result = await generateVoiceReply(alarmInput({ history, toolResult: okResult }), deps(client));

    expect(result).toEqual({ reply: 'Done, your alarm is set for 6:30 AM.' });
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0]?.[0];
    expect(params).not.toHaveProperty('tools');
    expect(params).not.toHaveProperty('tool_choice');
    expect(params?.messages[1]).toEqual({
      role: 'system',
      content: `${formatTimeContext(NOW, 'Asia/Manila')}\nThe user is talking to you on an Android phone.`,
    });
    expect(params?.messages.slice(2)).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'Set an alarm for 6:30 AM' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_abc', type: 'function', function: { name: 'setAlarm', arguments: '{"hour":6,"minute":30}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_abc', content: '{"ok":true,"status":"dispatched"}' },
    ]);
  });

  it('passes a phone failure to the model so it can explain it', async () => {
    const { client, create } = fakeModelClient(() =>
      Promise.resolve(fakeCompletion({ content: "I couldn't find a clock app on this phone." })),
    );
    const failed = { ...okResult, result: { ok: false as const, error: 'no_clock_app' as const } };

    await expect(generateVoiceReply(alarmInput({ toolResult: failed }), deps(client))).resolves.toEqual({
      reply: "I couldn't find a clock app on this phone.",
    });
    expect(create.mock.calls[0]?.[0].messages.at(-1)).toEqual({
      role: 'tool',
      tool_call_id: 'call_abc',
      content: '{"ok":false,"error":"no_clock_app"}',
    });
  });

  it.each([
    ['success', okResult, DEVICE_DONE_REPLY],
    ['failure', { ...okResult, result: { ok: false as const, error: 'failed' as const } }, DEVICE_FAILED_REPLY],
  ])('falls back to a safe reply on %s when the model returns no text', async (_label, toolResult, expected) => {
    const { client } = fakeModelClient(() => Promise.resolve(fakeCompletion({ content: '' })));

    await expect(generateVoiceReply(alarmInput({ toolResult }), deps(client))).resolves.toEqual({ reply: expected });
  });

  it('rejects a result for a tool this device was never offered (400) without calling the model', async () => {
    const { client, create } = fakeModelClient();

    await expectAppError(generateVoiceReply(alarmInput({ device: IPHONE, toolResult: okResult }), deps(client)), 400, 'validation_error');
    await expectAppError(generateVoiceReply(alarmInput({ device: undefined, toolResult: okResult }), deps(client)), 400, 'validation_error');
    expect(create).not.toHaveBeenCalled();
  });

  it('speaks an apology when the continuation hits tool_use_failed twice', async () => {
    const { client } = fakeModelClient(() => Promise.reject(toolUseFailedError()));

    await expect(generateVoiceReply(alarmInput({ toolResult: okResult }), deps(client))).resolves.toEqual({
      reply: TOOL_TROUBLE_REPLY,
    });
  });
});
