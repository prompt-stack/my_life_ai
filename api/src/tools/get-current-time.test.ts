import { describe, expect, it } from 'vitest';
import { getCurrentTime, getCurrentTimeTool } from './get-current-time.js';
import { createToolRegistry } from './registry.js';
import type { ToolContext } from './types.js';

// 01:30 UTC on Friday 2026-01-02 is 09:30 the same day in Manila (UTC+8).
const NOW = new Date('2026-01-02T01:30:00.000Z');

const ctx: ToolContext = { userId: 'user-1', timezone: 'Asia/Manila', now: NOW };

describe('getCurrentTime (plain function)', () => {
  it('returns Manila wall-clock time and offset', () => {
    expect(getCurrentTime('Asia/Manila', NOW)).toEqual({
      timezone: 'Asia/Manila',
      utc: '2026-01-02T01:30:00.000Z',
      local: '2026-01-02T09:30:00',
      utcOffset: '+08:00',
      weekday: 'Friday',
    });
  });

  it('handles UTC and negative offsets', () => {
    expect(getCurrentTime('UTC', NOW).utcOffset).toBe('+00:00');
    const ny = getCurrentTime('America/New_York', NOW);
    expect(ny.local).toBe('2026-01-01T20:30:00');
    expect(ny.utcOffset).toBe('-05:00');
    expect(ny.weekday).toBe('Thursday');
  });

  it('formats midnight as 00, not 24', () => {
    expect(getCurrentTime('Asia/Manila', new Date('2026-01-01T16:00:00.000Z')).local).toBe('2026-01-02T00:00:00');
  });
});

describe('getCurrentTimeTool (tool wrapper)', () => {
  const registry = createToolRegistry([getCurrentTimeTool]);

  it('declares a read risk level and server target', () => {
    expect(getCurrentTimeTool.riskLevel).toBe('read');
    expect(getCurrentTimeTool.target).toBe('server');
  });

  it("defaults to the user's timezone (Asia/Manila)", async () => {
    const result = await registry.execute('get_current_time', ctx, {});

    expect(result).toEqual({ ok: true, data: expect.objectContaining({ timezone: 'Asia/Manila', local: '2026-01-02T09:30:00' }) });
  });

  it('accepts an explicit valid timezone', async () => {
    const result = await registry.execute('get_current_time', ctx, { timezone: 'Asia/Tokyo' });

    expect(result).toEqual({ ok: true, data: expect.objectContaining({ timezone: 'Asia/Tokyo', utcOffset: '+09:00' }) });
  });

  it.each([
    ['an unknown timezone', { timezone: 'Mars/Olympus' }],
    ['a non-string timezone', { timezone: 8 }],
    ['an empty timezone', { timezone: '' }],
    ['an overlong timezone', { timezone: 'A'.repeat(65) }],
    ['unknown fields', { timezone: 'Asia/Manila', userId: 'someone-else' }],
    ['a non-object input', 'Asia/Manila'],
    ['null input', null],
  ])('rejects %s with invalid_arguments', async (_label, input) => {
    const result = await registry.execute('get_current_time', ctx, input);

    expect(result).toEqual({ ok: false, code: 'invalid_arguments', message: expect.any(String) });
  });
});
