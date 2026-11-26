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
import { createLogger } from '../lib/logger.js';
import { Writable } from 'node:stream';
import { fakeCompletion, fakeModelClient, fakeToolCall, toolUseFailedError } from '../test-utils/groq.js';
import { silentLogger } from '../test-utils/app.js';
import { createAlarmTool } from '../tools/create-alarm.js';
import {
  DEVICE_DONE_REPLY,
  EMPTY_REPLY,
  formatDeviceContext,
  formatTimeContext,
  generateVoiceReply,
  modelCallMetrics,
  REFUSAL_REPLY,
  stripReasoning,
  toMessageParams,
  TOOL_TROUBLE_REPLY,
  VOICE_TEMPERATURE,
  type VoiceAssistantDeps,
  type VoiceReplyInput,
} from './voice-assistant.js';
import { ALARM_RULES, DEVICE_RESULT_SYSTEM_PROMPT, VOICE_SYSTEM_PROMPT } from './voice-prompts.js';

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

const ANDROID = { platform: 'android', osVersion: '15', capabilities: ['createAlarm'] } as const satisfies VoiceReplyInput['device'];
const IPHONE = { platform: 'ios', osVersion: '18.5', capabilities: [] } as const satisfies VoiceReplyInput['device'];
const deps = (client: VoiceAssistantDeps['client']): VoiceAssistantDeps => ({ client, config, logger: silentLogger });

function alarmInput(overrides: Partial<VoiceReplyInput> = {}): VoiceReplyInput {
  return input({ text: 'Set an alarm for 6:30 AM', device: { ...ANDROID, capabilities: [...ANDROID.capabilities] }, ...overrides });
}

describe('formatDeviceContext', () => {
  it('names the platform, or returns undefined without device info', () => {
    expect(formatDeviceContext({ platform: 'ios', capabilities: [] })).toBe('The user is talking to you on an iPhone.');
    expect(formatDeviceContext({ platform: 'android', capabilities: [] })).toContain('an Android phone');
    expect(formatDeviceContext(undefined)).toBeUndefined();
  });

  it('lists the alarms when alarm tools are included', () => {
    expect(formatDeviceContext({ platform: 'android', capabilities: ['createAlarm'] }, 'included')).toBe(
      'The user is talking to you on an Android phone. No alarms yet.',
    );
  });

  it('says nothing about alarms when they are deferred for a non-alarm request', () => {
    expect(formatDeviceContext({ platform: 'android', capabilities: ['createAlarm'] }, 'deferred')).toBe(
      'The user is talking to you on an Android phone.',
    );
  });

  it.each([
    ['android', "Alarms aren't available in this version of the app."],
    ['ios', "I can't set alarms on this iPhone yet."],
  ] as const)('tells the model what to say on %s without alarm tools', (platform, wording) => {
    expect(formatDeviceContext({ platform, capabilities: [] }, 'unavailable')).toBe(
      `The user is talking to you on ${platform === 'ios' ? 'an iPhone' : 'an Android phone'}. ` +
        `Alarms are not available here: if asked to set, change or delete one, say only: ${wording}`,
    );
  });
});

describe('generateVoiceReply with device tools', () => {
  it('offers createAlarm (auto, no parallel calls) to a phone with the capability', async () => {
    const { client, create } = fakeModelClient();

    await generateVoiceReply(alarmInput(), deps(client));

    const params = create.mock.calls[0]?.[0];
    expect(params).toMatchObject({ tool_choice: 'auto', parallel_tool_calls: false });
    expect(params?.tools).toEqual([
      {
        type: 'function',
        function: { name: 'createAlarm', description: createAlarmTool.description, parameters: createAlarmTool.parameters },
      },
    ]);
    expect(params?.messages[0]).toEqual({ role: 'system', content: `${VOICE_SYSTEM_PROMPT}\n${ALARM_RULES}` });
    expect(params?.messages[1]).toEqual({
      role: 'system',
      content: `${formatTimeContext(NOW, 'Asia/Manila')}\nThe user is talking to you on an Android phone. No alarms yet.`,
    });
  });

  it('leaves the alarm tools, rules and list out of a request that is not about alarms', async () => {
    const { client, create } = fakeModelClient();

    await generateVoiceReply(alarmInput({ text: 'Tell me a joke' }), deps(client));

    const params = create.mock.calls[0]?.[0];
    expect(params).not.toHaveProperty('tools');
    expect(params?.messages[0]).toEqual({ role: 'system', content: VOICE_SYSTEM_PROMPT });
    expect(params?.messages[1]).toEqual({
      role: 'system',
      content: `${formatTimeContext(NOW, 'Asia/Manila')}\nThe user is talking to you on an Android phone.`,
    });
  });

  it('keeps the alarm tools for a short answer to an alarm question ("Yes")', async () => {
    const { client, create } = fakeModelClient();
    const history = [
      { role: 'user' as const, text: 'Delete my 6 AM alarm' },
      { role: 'assistant' as const, text: 'Your closest alarm is 6:30 AM. Delete that one?' },
    ];

    await generateVoiceReply(alarmInput({ text: 'Yes', history }), deps(client));

    expect(create.mock.calls[0]?.[0].tools?.map((tool) => tool.function?.name)).toEqual(['createAlarm']);
  });

  it('never sends the alarm rules to a phone without alarm tools', async () => {
    const { client, create } = fakeModelClient();

    await generateVoiceReply(alarmInput({ device: IPHONE }), deps(client));

    expect(create.mock.calls[0]?.[0].messages[0]).toEqual({ role: 'system', content: VOICE_SYSTEM_PROMPT });
  });

  it.each([
    ['an iPhone without the capability', { device: IPHONE }],
    ['a web client claiming the capability', { device: { platform: 'web' as const, capabilities: ['createAlarm' as const] } }],
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

  it('tells the model on an iPhone without the capability what to say about alarms', async () => {
    const { client, create } = fakeModelClient();

    await generateVoiceReply(alarmInput({ device: IPHONE }), deps(client));

    expect(create.mock.calls[0]?.[0].messages[1]).toMatchObject({
      content: expect.stringContaining("say only: I can't set alarms on this iPhone yet."),
    });
  });

  it('returns a deviceAction for a valid createAlarm call', async () => {
    const { client } = fakeModelClient(() =>
      Promise.resolve(
        fakeCompletion({ content: null, toolCalls: [fakeToolCall('createAlarm', { hour: 6, minute: 30, label: 'Wake up' })] }),
      ),
    );

    await expect(generateVoiceReply(alarmInput(), deps(client))).resolves.toEqual({
      reply: '',
      deviceAction: { callId: 'call_test_1', name: 'createAlarm', args: { hour: 6, minute: 30, label: 'Wake up' } },
    });
  });

  it('keeps any model text alongside the action', async () => {
    const { client } = fakeModelClient(() =>
      Promise.resolve(fakeCompletion({ content: 'Setting it now.', toolCalls: [fakeToolCall('createAlarm', { hour: 18, minute: 0 })] })),
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
      Promise.resolve(fakeCompletion({ content: null, toolCalls: [fakeToolCall('createAlarm', args)] })),
    );

    const result = await generateVoiceReply(alarmInput(), deps(client));

    expect(result).toEqual({ reply: createAlarmTool.clarificationReply });
    expect(result).not.toHaveProperty('deviceAction');
  });

  it('never emits an action for a tool that was not offered', async () => {
    const { client } = fakeModelClient(() =>
      Promise.resolve(fakeCompletion({ content: 'Okay.', toolCalls: [fakeToolCall('createAlarm', { hour: 6, minute: 0 })] })),
    );

    await expect(generateVoiceReply(alarmInput({ device: IPHONE }), deps(client))).resolves.toEqual({ reply: 'Okay.' });
  });

  it('retries once on tool_use_failed and returns the second answer', async () => {
    const { client, create } = fakeModelClient();
    create
      .mockImplementationOnce(() => Promise.reject(toolUseFailedError()))
      .mockImplementationOnce(() =>
        Promise.resolve(fakeCompletion({ content: null, toolCalls: [fakeToolCall('createAlarm', { hour: 6, minute: 0 })] })),
      );

    const result = await generateVoiceReply(alarmInput(), deps(client));

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.deviceAction).toEqual({ callId: 'call_test_1', name: 'createAlarm', args: { hour: 6, minute: 0 } });
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
    name: 'createAlarm',
    args: { hour: 6, minute: 30 },
    result: { ok: true, status: 'done' },
  } as const satisfies VoiceReplyInput['toolResult'];

  it('replays the tool call and result, sends no tools, and returns only the spoken reply', async () => {
    const { client, create } = fakeModelClient(() =>
      Promise.resolve(fakeCompletion({ content: 'Alarm set for 6:30 AM with Sunrise.' })),
    );
    const history = [
      { role: 'user' as const, text: 'Hi' },
      { role: 'assistant' as const, text: 'Hello!' },
    ];

    const result = await generateVoiceReply(alarmInput({ history, toolResult: okResult }), deps(client));

    expect(result).toEqual({ reply: 'Alarm set for 6:30 AM with Sunrise.' });
    expect(create).toHaveBeenCalledTimes(1);
    const params = create.mock.calls[0]?.[0];
    expect(params).not.toHaveProperty('tools');
    expect(params).not.toHaveProperty('tool_choice');
    expect(params?.messages[0]).toEqual({ role: 'system', content: DEVICE_RESULT_SYSTEM_PROMPT });
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
          { id: 'call_abc', type: 'function', function: { name: 'createAlarm', arguments: '{"hour":6,"minute":30}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_abc', content: '{"ok":true,"status":"done"}' },
    ]);
  });

  it('answers a phone failure with a fixed reply and never calls the model', async () => {
    const { client, create } = fakeModelClient();
    const failed = { ...okResult, result: { ok: false as const, error: 'permission_required' as const } };

    await expect(generateVoiceReply(alarmInput({ toolResult: failed }), deps(client))).resolves.toEqual({
      reply: "I need permission to set alarms. Please allow 'Alarms & reminders' for MyLife, then try again.",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('falls back to a safe reply on success when the model returns no text', async () => {
    const { client } = fakeModelClient(() => Promise.resolve(fakeCompletion({ content: '' })));

    await expect(generateVoiceReply(alarmInput({ toolResult: okResult }), deps(client))).resolves.toEqual({
      reply: DEVICE_DONE_REPLY,
    });
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

describe('model call logging', () => {
  function capture() {
    const lines: Record<string, unknown>[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
        callback();
      },
    });
    return { logger: createLogger({ level: 'info', destination }), lines };
  }

  it('reads Groq timings (seconds → ms) and reasoning tokens from usage', () => {
    const completion = fakeCompletion();
    completion.usage = {
      prompt_tokens: 900,
      completion_tokens: 120,
      total_tokens: 1020,
      queue_time: 0.0123,
      prompt_time: 0.05,
      completion_time: 0.4,
      total_time: 0.4623,
      completion_tokens_details: { reasoning_tokens: 80 },
    };

    expect(modelCallMetrics(completion)).toEqual({
      finishReason: 'stop',
      inputTokens: 900,
      outputTokens: 120,
      reasoningTokens: 80,
      groqQueueMs: 12,
      groqPromptMs: 50,
      groqCompletionMs: 400,
      groqTotalMs: 462,
    });
  });

  it('reads cached prompt tokens when Groq reports them', () => {
    const completion = fakeCompletion();
    completion.usage = {
      prompt_tokens: 1500,
      completion_tokens: 20,
      total_tokens: 1520,
      prompt_tokens_details: { cached_tokens: 1280 },
    };

    expect(modelCallMetrics(completion)).toMatchObject({ inputTokens: 1500, cachedTokens: 1280 });
  });

  it('logs one line per attempt with attempt number, tools offered and latency, never the user text', async () => {
    const { logger, lines } = capture();
    const { client, create } = fakeModelClient();
    create
      .mockImplementationOnce(() => Promise.reject(toolUseFailedError()))
      .mockImplementationOnce(() => Promise.resolve(fakeCompletion({ content: 'Sure.' })));

    await generateVoiceReply(alarmInput({ text: 'my private alarm words' }), { client, config, logger });

    const calls = lines.filter((line) => line.msg === 'model call completed' || String(line.msg).includes('tool_use_failed'));
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ attempt: 1, turn: 'user', toolsOffered: 1, latencyMs: expect.any(Number) });
    expect(calls[1]).toMatchObject({ msg: 'model call completed', attempt: 2, turn: 'user', toolsOffered: 1, inputTokens: 12 });
    expect(JSON.stringify(lines)).not.toContain('my private alarm words');
  });

  it('logs a failed call with its latency before mapping the error', async () => {
    const { logger, lines } = capture();
    const { client } = fakeModelClient(() => Promise.reject(new InternalServerError(500, undefined, 'boom', new Headers())));

    await expect(generateVoiceReply(input(), { client, config, logger })).rejects.toBeInstanceOf(AppError);

    expect(lines.find((line) => line.msg === 'model call failed')).toMatchObject({ attempt: 1, toolsOffered: 0, turn: 'user' });
  });
});
