import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { evalCaseSchema } from './types.js';

describe('eval cases', () => {
  it.each(['get-current-time.json', 'alarms.json'])('%s matches the eval case schema', async (file) => {
    const raw = await readFile(new URL(`./cases/${file}`, import.meta.url), 'utf8');
    const cases = z.array(evalCaseSchema).parse(JSON.parse(raw));
    expect(cases.length).toBeGreaterThan(0);
  });
});
