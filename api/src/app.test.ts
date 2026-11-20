import { Writable } from 'node:stream';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createLogger } from './lib/logger.js';
import { buildTestApp, FIXED_NOW } from './test-utils/app.js';

const app = buildTestApp();

function expectStandardError(body: unknown, code: string): void {
  expect(body).toEqual({
    error: { code, message: expect.any(String), requestId: expect.any(String) },
  });
}

describe('GET /health', () => {
  it('returns 200 with status, version, uptime and UTC time', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      version: '0.0.0-test',
      uptimeSeconds: 42,
      time: FIXED_NOW.toISOString(),
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('sets security headers and hides x-powered-by', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('request id', () => {
  it('echoes a safe incoming x-request-id', async () => {
    const res = await request(app).get('/health').set('x-request-id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('replaces an unsafe incoming x-request-id', async () => {
    const res = await request(app).get('/health').set('x-request-id', 'bad id\twith spaces');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('unknown routes', () => {
  it('returns 404 with the standard error body and an x-request-id header', async () => {
    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expectStandardError(res.body, 'not_found');
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
    expect((res.body as { error: { requestId: string } }).error.requestId).toBe(res.headers['x-request-id']);
  });
});

describe('placeholder routes', () => {
  it.each([
    ['post', '/chat'],
    ['post', '/voice'],
    ['get', '/tasks'],
    ['get', '/approvals'],
    ['get', '/integrations/google'],
  ] as const)('%s %s returns 501 not_implemented', async (method, path) => {
    const res = await request(app)[method](path);

    expect(res.status).toBe(501);
    expectStandardError(res.body, 'not_implemented');
  });
});

describe('body parsing', () => {
  it('returns 400 invalid_json for malformed JSON', async () => {
    const res = await request(app).post('/chat').set('content-type', 'application/json').send('{"message":');

    expect(res.status).toBe(400);
    expectStandardError(res.body, 'invalid_json');
  });

  it('returns 413 payload_too_large for a body over 100kb', async () => {
    const res = await request(app)
      .post('/chat')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ message: 'x'.repeat(110 * 1024) }));

    expect(res.status).toBe(413);
    expectStandardError(res.body, 'payload_too_large');
  });
});

describe('CORS', () => {
  it('allows a configured origin', async () => {
    const res = await request(app).get('/health').set('origin', 'https://dashboard.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://dashboard.example.com');
  });

  it('does not allow an unknown origin', async () => {
    const res = await request(app).get('/health').set('origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('internal errors', () => {
  it('returns a generic 500 without leaking the error message, and logs it once at error level', async () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const failingApp = buildTestApp({
      logger: createLogger({ level: 'info', destination }),
      clock: {
        now: () => {
          throw new Error('secret internal detail');
        },
      },
    });

    const res = await request(failingApp).get('/health');

    expect(res.status).toBe(500);
    expectStandardError(res.body, 'internal_error');
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail');

    const errorLines = lines
      .map((line) => JSON.parse(line) as { level: number; err?: { message: string } })
      .filter((entry) => entry.level >= 50);
    expect(errorLines).toHaveLength(1);
    expect(errorLines[0]?.err?.message).toBe('secret internal detail');
  });
});
