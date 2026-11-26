import { Writable } from 'node:stream';
import { InternalServerError, RateLimitError } from 'groq-sdk';
import { describe, expect, it, vi } from 'vitest';
import { createGroqClient, createSdkLogger, withoutRateLimitRetries } from './groq.js';
import { createLogger } from './logger.js';

const silent = createLogger({ level: 'silent' });

function captureLogger() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLogger({ level: 'debug', destination }), lines };
}

describe('createSdkLogger', () => {
  it('forwards SDK info/warn/error lines tagged as groq-sdk', () => {
    const { logger, lines } = captureLogger();
    const sdk = createSdkLogger(logger);

    sdk.info('[log_1] POST https://api.groq.com/openai/v1/chat/completions failed with status 429 in 120ms - retrying, 1 attempts remaining');
    sdk.warn('warned');
    sdk.error('errored');

    expect(lines).toHaveLength(3);
    const first = JSON.parse(lines[0] ?? '{}') as { component?: string; msg?: string };
    expect(first.component).toBe('groq-sdk');
    expect(first.msg).toContain('status 429');
    expect(first.msg).toContain('retrying');
  });

  it('drops debug lines, which carry request bodies (user text)', () => {
    const { logger, lines } = captureLogger();

    createSdkLogger(logger).debug('[log_1] sending request');

    expect(lines).toHaveLength(0);
  });
});

function jsonResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: { message: `status ${status}` } }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('withoutRateLimitRetries', () => {
  it('marks 429 responses as not retryable and keeps status and headers', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse(429, { 'retry-after': '18', 'x-should-retry': 'true' })));

    const response = await withoutRateLimitRetries(fetchImpl)('https://example.test');

    expect(response.status).toBe(429);
    expect(response.headers.get('x-should-retry')).toBe('false');
    expect(response.headers.get('retry-after')).toBe('18');
  });

  it('passes other responses through untouched', async () => {
    const original = jsonResponse(500);

    await expect(withoutRateLimitRetries(() => Promise.resolve(original))('https://example.test')).resolves.toBe(original);
  });
});

describe('createGroqClient retries', () => {
  const params = { model: 'openai/gpt-oss-20b', messages: [{ role: 'user' as const, content: 'hi' }] };

  it('does not retry (or sleep on) a 429, even when Groq says retry', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse(429, { 'retry-after': '18', 'x-should-retry': 'true' })));
    const client = createGroqClient('test-key-not-real', silent, fetchImpl);

    const startedAt = Date.now();
    await expect(client.chat.completions.create(params)).rejects.toBeInstanceOf(RateLimitError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it('still retries a 5xx once', async () => {
    // retry-after-ms 0 keeps the test fast; the SDK honours it instead of its backoff.
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse(503, { 'retry-after-ms': '0' })));
    const client = createGroqClient('test-key-not-real', silent, fetchImpl);

    await expect(client.chat.completions.create(params)).rejects.toBeInstanceOf(InternalServerError);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
