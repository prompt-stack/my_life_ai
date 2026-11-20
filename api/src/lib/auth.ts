import type { RequestHandler } from 'express';
import { UnauthorizedError } from './errors.js';

/**
 * Identity of the caller, derived ONLY from a verified token (rule 7).
 * Never populate this from the request body, query string or model output.
 */
export interface AuthContext {
  userId: string;
  /** Raw access token, kept so data access can create an RLS-scoped Supabase client. Never log it. */
  accessToken: string;
}

export interface VerifiedToken {
  userId: string;
}

/**
 * Verifies a bearer token and returns the identity it proves, or throws
 * `UnauthorizedError`. Injected into `createApp` so tests can pass a fake.
 *
 * TODO(Phase 1): implement `createSupabaseTokenVerifier()` that verifies the
 * Supabase JWT (signature, `exp`, `aud`) and returns `{ userId: payload.sub }`.
 */
export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

/** Default until Supabase auth lands: every protected request is rejected. */
export const notConfiguredTokenVerifier: TokenVerifier = {
  verify: () =>
    Promise.reject(new UnauthorizedError('Authentication is not configured yet', 'auth_not_configured')),
};

const BEARER_PATTERN = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/;
// Real Supabase JWTs are well under this; the bound stops oversized headers early.
const MAX_TOKEN_LENGTH = 8192;

export function extractBearerToken(header: string | undefined): string | undefined {
  if (header === undefined || header.length > MAX_TOKEN_LENGTH) return undefined;
  return BEARER_PATTERN.exec(header)?.[1];
}

/**
 * Requires a valid bearer token and sets `res.locals.auth`.
 * Not applied to `/health`. Apply per router to protected routes.
 */
export function requireAuth(verifier: TokenVerifier): RequestHandler {
  return async (req, res, next) => {
    const token = extractBearerToken(req.get('authorization'));
    if (token === undefined) {
      throw new UnauthorizedError('Missing or malformed bearer token');
    }

    // A rejection here (e.g. UnauthorizedError) reaches the error handler via
    // Express 5's native promise handling.
    const verified = await verifier.verify(token);
    res.locals.auth = { userId: verified.userId, accessToken: token };
    next();
  };
}
