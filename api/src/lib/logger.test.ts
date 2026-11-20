import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';

function captureLogger() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLogger({ level: 'info', destination }), lines };
}

describe('createLogger redaction', () => {
  it('redacts auth headers, cookies and token-like fields', () => {
    const { logger, lines } = captureLogger();

    logger.info(
      {
        req: { headers: { authorization: 'Bearer secret-jwt', cookie: 'sb=secret-cookie' } },
        integration: { accessToken: 'secret-oauth', refreshToken: 'secret-refresh' },
        apiKey: 'secret-key',
      },
      'test',
    );

    const output = lines.join('');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toMatch(/secret-/);
  });
});
