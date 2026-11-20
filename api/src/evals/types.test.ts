import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { evalCaseSchema } from './types.js';

describe('eval cases', () => {
  it('example cases match the eval case schema', async () => {
    const raw = await readFile(new URL('./cases/get-current-time.json', import.meta.url), 'utf8');
    const cases = z.array(evalCaseSchema).parse(JSON.parse(raw));
    expect(cases.length).toBeGreaterThan(0);
  });
});
