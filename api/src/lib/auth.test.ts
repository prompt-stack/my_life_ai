import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildRouterTestApp } from '../test-utils/app.js';
import { extractBearerToken, notConfiguredTokenVerifier, requireAuth, type TokenVerifier } from './auth.js';
import { UnauthorizedError } from './errors.js';

/** Test-only protected router that echoes the identity requireAuth established. */
function buildProtectedApp(verifier: TokenVerifier) {
  const router = Router();
  router.post('/protected', requireAuth(verifier), (_req, res) => {
    res.json({ userId: res.locals.auth?.userId });
  });
  return buildRouterTestApp(router);
}

const fakeVerifier: TokenVerifier = {
  verify: (token) =>
    token === 'valid-token'
      ? Promise.resolve({ userId: 'user-from-token' })
      : Promise.reject(new UnauthorizedError('Invalid token')),
};

describe('extractBearerToken', () => {
  it('extracts a bearer token', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it.each([undefined, '', 'Basic abc', 'Bearer ', 'Bearer a b', `Bearer ${'a'.repeat(9000)}`])(
    'rejects %j',
    (header) => {
      expect(extractBearerToken(header)).toBeUndefined();
    },
  );
});

describe('requireAuth', () => {
  it('returns 401 auth_not_configured with the default verifier', async () => {
    const app = buildProtectedApp(notConfiguredTokenVerifier);

    const res = await request(app).post('/protected').set('authorization', 'Bearer some-token');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'auth_not_configured', message: expect.any(String), requestId: expect.any(String) },
    });
  });

  it('returns 401 unauthorized when the header is missing', async () => {
    const res = await request(buildProtectedApp(fakeVerifier)).post('/protected');

    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('unauthorized');
  });

  it('returns 401 when the verifier rejects the token', async () => {
    const res = await request(buildProtectedApp(fakeVerifier))
      .post('/protected')
      .set('authorization', 'Bearer wrong-token');

    expect(res.status).toBe(401);
  });

  it('takes identity from the verified token, never from the body', async () => {
    const res = await request(buildProtectedApp(fakeVerifier))
      .post('/protected')
      .set('authorization', 'Bearer valid-token')
      .send({ userId: 'attacker-chosen-id' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 'user-from-token' });
  });
});
