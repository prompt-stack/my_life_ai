import { describe, expect, it } from 'vitest';
import { captureVoiceParams, estimateTokens, PROMPT_SCENARIOS } from '../test-utils/prompt-size.js';

/**
 * Input-token budgets for POST /voice (estimated, ~4 chars per token). Groq's
 * free tier allows about 8K input tokens per minute per org and an alarm
 * action takes two calls, so every request must stay small. Before the
 * trim (2026-11-25) every Android request was ~2,500 tokens.
 */
const BUDGETS: Record<string, number> = {
  'general chat, Android, no alarms': 400,
  'general chat, Android, 2 alarms': 400,
  'general chat, iPhone (no alarm tools)': 400,
  'alarm create, Android, no alarms': 1_650,
  'alarm create, Android, 2 alarms': 1_650,
  'sounds question, Android, 2 alarms': 1_650,
  'alarm decline, iPhone': 400,
  'confirmation "Yes", Android, 2 alarms': 1_700,
  // Only while an alarm rings: adds stopAlarm + snoozeAlarm and the ringing line (~110 tokens).
  'stop while ringing, Android, 2 alarms': 1_800,
  'continuation after stopAlarm, Android': 500,
  'continuation after createAlarm, Android': 500,
};

describe('voice prompt size', () => {
  it('has a budget for every scenario', () => {
    expect(Object.keys(BUDGETS).sort()).toEqual(PROMPT_SCENARIOS.map((scenario) => scenario.name).sort());
  });

  it.each(PROMPT_SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    '%s stays within its token budget',
    async (name, scenario) => {
      const tokens = estimateTokens(await captureVoiceParams(scenario));
      expect(tokens, `${name}: ~${tokens} tokens`).toBeLessThanOrEqual(BUDGETS[name] ?? 0);
    },
  );

  it('sends no tools for general requests, four alarm tools for alarm requests, and six while ringing', async () => {
    const scenario = (name: string) => {
      const found = PROMPT_SCENARIOS.find((candidate) => candidate.name === name);
      if (!found) throw new Error(`Unknown scenario: ${name}`);
      return found;
    };
    const general = await captureVoiceParams(scenario('general chat, Android, 2 alarms'));
    const alarm = await captureVoiceParams(scenario('alarm create, Android, 2 alarms'));
    const ringing = await captureVoiceParams(scenario('stop while ringing, Android, 2 alarms'));

    expect(general.tools).toBeUndefined();
    expect(alarm.tools).toHaveLength(4);
    expect(ringing.tools).toHaveLength(6);
  });
});
