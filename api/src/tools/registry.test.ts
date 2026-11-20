import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createToolRegistry } from './registry.js';
import { defineTool, toolOk, type ToolContext } from './types.js';

const ctx: ToolContext = { userId: 'user-1', timezone: 'Asia/Manila', now: new Date(0) };
const emptyInput = z.object({}).strict();

function makeTool(overrides: Partial<Parameters<typeof defineTool>[0]> = {}) {
  return defineTool({
    name: 'example',
    description: 'example tool',
    riskLevel: 'read',
    target: 'server',
    input: emptyInput,
    execute: () => Promise.resolve(toolOk('done')),
    ...overrides,
  });
}

describe('createToolRegistry', () => {
  it('rejects duplicate tool names', () => {
    expect(() => createToolRegistry([makeTool(), makeTool()])).toThrow(/Duplicate tool name/);
  });

  it('returns unknown_tool for an unregistered name', async () => {
    const result = await createToolRegistry([]).execute('nope', ctx, {});
    expect(result).toMatchObject({ ok: false, code: 'unknown_tool' });
  });

  it('never executes sensitive tools directly', async () => {
    const execute = vi.fn(() => Promise.resolve(toolOk('sent')));
    const registry = createToolRegistry([makeTool({ name: 'send_email', riskLevel: 'sensitive', execute })]);

    const result = await registry.execute('send_email', ctx, {});

    expect(result).toMatchObject({ ok: false, code: 'approval_required' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not execute device tools on the server', async () => {
    const execute = vi.fn(() => Promise.resolve(toolOk('ok')));
    const registry = createToolRegistry([makeTool({ name: 'add_contact', riskLevel: 'write', target: 'device', execute })]);

    const result = await registry.execute('add_contact', ctx, {});

    expect(result).toMatchObject({ ok: false, code: 'device_unavailable' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('turns a thrown error into a structured tool_failed result and logs it', async () => {
    const logger = { error: vi.fn() };
    const registry = createToolRegistry(
      [makeTool({ execute: () => Promise.reject(new Error('boom')) })],
      logger,
    );

    const result = await registry.execute('example', ctx, {});

    expect(result).toEqual({ ok: false, code: 'tool_failed', message: expect.any(String) });
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
