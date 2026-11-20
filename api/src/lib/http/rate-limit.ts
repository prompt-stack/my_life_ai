import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { TooManyRequestsError } from '../errors.js';

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
  skip?: (path: string) => boolean;
}

/**
 * Per-IP rate limiter that answers with the standard error body.
 *
 * TODO(Phase 2): switch to a Redis store (`rate-limit-redis`, ask first) so
 * limits hold across API instances, and key authenticated routes by userId
 * in addition to IP.
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const { skip } = options;
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(skip ? { skip: (req) => skip(req.path) } : {}),
    handler: (_req, _res, next) => {
      next(new TooManyRequestsError());
    },
  });
}
