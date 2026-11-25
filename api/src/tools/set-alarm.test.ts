import { SetAlarmArgsSchema } from '@mylife/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { setAlarmTool } from './set-alarm.js';

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

describe('setAlarmTool', () => {
  it('is an Android-only device tool with write risk', () => {
    expect(setAlarmTool).toMatchObject({ name: 'setAlarm', riskLevel: 'write', target: 'device', platforms: ['android'] });
    expect(setAlarmTool.input).toBe(SetAlarmArgsSchema);
    expect(setAlarmTool.clarificationReply).toMatch(/what time/i);
  });

  it('shows the model a JSON Schema that matches the shared Zod schema', () => {
    const generated: Record<string, unknown> = { ...z.toJSONSchema(SetAlarmArgsSchema) };
    delete generated.$schema;
    expect(withoutDescriptions(setAlarmTool.parameters)).toEqual(generated);
  });
});
