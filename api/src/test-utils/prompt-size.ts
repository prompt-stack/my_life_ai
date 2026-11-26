import type { DeviceInfo, VoiceToolResult, VoiceTurn } from '@mylife/shared';
import type { ChatCompletionCreateParamsNonStreaming } from 'groq-sdk/resources/chat/completions';
import type { ModelClient } from '../lib/groq.js';
import { generateVoiceReply, type VoiceAssistantDeps } from '../agents/voice-assistant.js';
import { ALARM_TOOL_NAMES, EVENING, WAKE } from './alarms.js';
import { silentLogger } from './app.js';
import { fakeCompletion } from './groq.js';

/**
 * Prompt-size measurement for POST /voice. Builds the exact Chat Completions
 * params the server would send for representative requests (no network) and
 * estimates their input tokens, so the Groq free-tier budget (8K tokens/min)
 * can be guarded by tests.
 */

/**
 * Rough token estimate: about 4 characters per token for English and JSON,
 * plus a few tokens of chat-template overhead per message. Calibrated loosely
 * against real Groq `prompt_tokens` for gpt-oss-20b; good enough for budgets.
 */
export const CHARS_PER_TOKEN = 4;
const TOKENS_PER_MESSAGE = 4;

export function estimateTokens(params: ChatCompletionCreateParamsNonStreaming): number {
  const messageChars = params.messages.reduce((sum, message) => sum + JSON.stringify(message).length, 0);
  const toolChars = params.tools ? JSON.stringify(params.tools).length : 0;
  return Math.ceil((messageChars + toolChars) / CHARS_PER_TOKEN) + params.messages.length * TOKENS_PER_MESSAGE;
}

/** Characters of the system messages and the tools only (the part we control). */
export function promptParts(params: ChatCompletionCreateParamsNonStreaming): { systemChars: number; toolChars: number } {
  const systemChars = params.messages
    .filter((message) => message.role === 'system')
    .reduce((sum, message) => sum + (typeof message.content === 'string' ? message.content.length : JSON.stringify(message.content).length), 0);
  const toolChars = params.tools ? JSON.stringify(params.tools).length : 0;
  return { systemChars, toolChars };
}

const NOW = new Date('2026-01-02T01:30:00.000Z');
const config: VoiceAssistantDeps['config'] = { model: 'openai/gpt-oss-20b', maxTokens: 1024, reasoningEffort: 'low' };

const POCO: DeviceInfo = {
  platform: 'android',
  osVersion: '15',
  manufacturer: 'Xiaomi',
  brand: 'POCO',
  model: 'POCO F9 Pro',
  capabilities: [...ALARM_TOOL_NAMES],
  alarms: [WAKE, EVENING],
};
const POCO_NO_ALARMS: DeviceInfo = { ...POCO, alarms: [] };
const IPHONE: DeviceInfo = { platform: 'ios', osVersion: '18.5', model: 'iPhone', capabilities: [] };
const POCO_RINGING: DeviceInfo = { ...POCO, ringingAlarmId: WAKE.id };

export interface PromptScenario {
  name: string;
  text: string;
  device?: DeviceInfo;
  history?: VoiceTurn[];
  toolResult?: VoiceToolResult;
}

export const PROMPT_SCENARIOS: readonly PromptScenario[] = [
  { name: 'general chat, Android, no alarms', text: 'Tell me a fun fact about octopuses', device: POCO_NO_ALARMS },
  { name: 'general chat, Android, 2 alarms', text: 'How do I cook adobo?', device: POCO },
  { name: 'general chat, iPhone (no alarm tools)', text: 'Tell me a fun fact about octopuses', device: IPHONE },
  { name: 'alarm create, Android, no alarms', text: 'Set an alarm for 6 AM', device: POCO_NO_ALARMS },
  { name: 'alarm create, Android, 2 alarms', text: 'Set an alarm for 6 AM', device: POCO },
  { name: 'sounds question, Android, 2 alarms', text: 'What sounds are there?', device: POCO },
  { name: 'alarm decline, iPhone', text: 'Set an alarm for 6 AM', device: IPHONE },
  {
    name: 'confirmation "Yes", Android, 2 alarms',
    text: 'Yes',
    device: POCO,
    history: [
      { role: 'user', text: 'Delete my 6 AM alarm' },
      { role: 'assistant', text: 'Your closest alarm is 6:30 AM. Delete that one?' },
    ],
  },
  { name: 'stop while ringing, Android, 2 alarms', text: 'Stop', device: POCO_RINGING },
  {
    name: 'continuation after stopAlarm, Android',
    text: 'Stop',
    device: POCO,
    toolResult: { callId: 'call_1', name: 'stopAlarm', args: { alarmId: WAKE.id }, result: { ok: true, status: 'done' } },
  },
  {
    name: 'continuation after createAlarm, Android',
    text: 'Set an alarm for 6 AM',
    device: POCO,
    toolResult: {
      callId: 'call_1',
      name: 'createAlarm',
      args: { hour: 6, minute: 0 },
      result: {
        ok: true,
        status: 'done',
        alarm: { id: 'alarm-9', hour: 6, minute: 0, weekdays: [], sound: 'sunrise', enabled: true, nextTriggerAt: null },
      },
    },
  },
];

/** The params the server sends to Groq for this scenario (the fake model just says "Okay."). */
export async function captureVoiceParams(scenario: PromptScenario): Promise<ChatCompletionCreateParamsNonStreaming> {
  const captured: ChatCompletionCreateParamsNonStreaming[] = [];
  const client: ModelClient = {
    chat: {
      completions: {
        create(params) {
          captured.push(params);
          return Promise.resolve(fakeCompletion({ content: 'Okay.' }));
        },
      },
    },
  };
  await generateVoiceReply(
    {
      text: scenario.text,
      history: scenario.history ?? [],
      timezone: 'Asia/Manila',
      now: NOW,
      ...(scenario.device ? { device: scenario.device } : {}),
      ...(scenario.toolResult ? { toolResult: scenario.toolResult } : {}),
    },
    { client, config, logger: silentLogger },
  );
  const params = captured[0];
  if (!params) throw new Error(`No model call for scenario: ${scenario.name}`);
  return params;
}
