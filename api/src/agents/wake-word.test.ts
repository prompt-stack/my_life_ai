import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../lib/logger.js';
import { androidWithAlarms } from '../test-utils/alarms.js';
import { silentLogger } from '../test-utils/app.js';
import { fakeCompletion, fakeModelClient } from '../test-utils/groq.js';
import { isAlarmRequest } from './alarm-intent.js';
import { generateVoiceReply, WAKE_ONLY_REPLY, type VoiceAssistantDeps, type VoiceReplyInput } from './voice-assistant.js';
import { stripWakeWord } from './wake-word.js';

const config: VoiceAssistantDeps['config'] = { model: 'openai/gpt-oss-20b', maxTokens: 1024, reasoningEffort: 'low' };
const NOW = new Date('2026-01-02T01:30:00.000Z');

function input(overrides: Partial<VoiceReplyInput> = {}): VoiceReplyInput {
  return { text: 'What time is it?', history: [], timezone: 'Asia/Manila', now: NOW, requestId: 'req-1', ...overrides };
}

describe('stripWakeWord', () => {
  it.each([
    ['AI, set an alarm for 6 AM', 'set an alarm for 6 AM'],
    ["Hey AI what's the time", "what's the time"],
    ['MyLife AI stop', 'stop'],
    ['My Life AI, stop', 'stop'],
    ['hey, AI. snooze', 'snooze'],
    ['OK AI turn it off', 'turn it off'],
    ['okay ai: what is the weather', 'what is the weather'],
    ['Hi AI… hello', 'hello'],
    ['A.I. set an alarm', 'set an alarm'],
    ['A. I., set an alarm', 'set an alarm'],
    ['ai set an alarm', 'set an alarm'],
    ['  AI —  remind me later', 'remind me later'],
  ])('strips the leading trigger from %j', (text, expected) => {
    expect(stripWakeWord(text)).toBe(expected);
  });

  it.each(['AI', 'Hey AI', 'MyLife AI.', 'ok, AI!', 'A.I.'])('returns empty when only the trigger was said (%j)', (text) => {
    expect(stripWakeWord(text)).toBe('');
  });

  it.each([
    'Tell me about AI',
    'Is AI going to take my job?',
    'Aim for 6 AM',
    'Aisle 5 is where?',
    'Hey what time is it',
    'Hi there',
    'Mail my boss',
  ])('leaves %j unchanged', (text) => {
    expect(stripWakeWord(text)).toBe(text);
  });

  it('keeps alarm detection working after stripping', () => {
    expect(isAlarmRequest(stripWakeWord('AI, set an alarm for 6 AM'), [])).toBe(true);
    expect(isAlarmRequest(stripWakeWord('Hey AI wake me at 6:30'), [])).toBe(true);
    expect(isAlarmRequest(stripWakeWord("Hey AI what's the weather"), [])).toBe(false);
  });
});

describe('generateVoiceReply with invocation', () => {
  it('strips the trigger from wake_word turns before building messages, and still offers alarm tools', async () => {
    const { client, create } = fakeModelClient();

    await generateVoiceReply(input({ text: 'AI, set an alarm for 6 AM', invocation: 'wake_word', device: androidWithAlarms() }), {
      client,
      config,
      logger: silentLogger,
    });

    const params = create.mock.calls[0]?.[0];
    expect(params?.messages.at(-1)).toEqual({ role: 'user', content: 'set an alarm for 6 AM' });
    expect(params?.tools?.map((tool) => tool.function?.name)).toContain('createAlarm');
  });

  it.each(['tap', 'speak_button', 'deep_link', undefined] as const)('does not strip when invocation is %s', async (invocation) => {
    const { client, create } = fakeModelClient();

    await generateVoiceReply(input({ text: 'AI, what time is it?', ...(invocation ? { invocation } : {}) }), {
      client,
      config,
      logger: silentLogger,
    });

    expect(create.mock.calls[0]?.[0].messages.at(-1)).toEqual({ role: 'user', content: 'AI, what time is it?' });
  });

  it('answers a bare trigger without calling the model (even when the AI is not configured)', async () => {
    const { client, create } = fakeModelClient();

    await expect(generateVoiceReply(input({ text: 'Hey AI', invocation: 'wake_word' }), { client, config, logger: silentLogger })).resolves.toEqual({
      reply: WAKE_ONLY_REPLY,
    });
    expect(create).not.toHaveBeenCalled();
    await expect(
      generateVoiceReply(input({ text: 'AI', invocation: 'wake_word' }), { client: undefined, config, logger: silentLogger }),
    ).resolves.toEqual({ reply: WAKE_ONLY_REPLY });
  });

  it('logs the invocation on the per-turn line, never the text', async () => {
    const lines: Record<string, unknown>[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
        callback();
      },
    });
    const logger = createLogger({ level: 'info', destination });
    const { client } = fakeModelClient(() => Promise.resolve(fakeCompletion({ content: 'Sure.' })));

    await generateVoiceReply(input({ text: 'AI, my private words', invocation: 'wake_word' }), { client, config, logger });

    expect(lines.find((line) => line.msg === 'voice reply generated')).toMatchObject({ invocation: 'wake_word', turn: 'user' });
    expect(JSON.stringify(lines)).not.toContain('my private words');
  });
});
