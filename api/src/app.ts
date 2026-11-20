import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/env.js';
import { notConfiguredTokenVerifier, type TokenVerifier } from './lib/auth.js';
import { systemClock, type Clock } from './lib/clock.js';
import { errorHandler } from './lib/http/error-handler.js';
import { notFound } from './lib/http/not-found.js';
import { createRateLimiter } from './lib/http/rate-limit.js';
import { requestId } from './lib/http/request-id.js';
import { requestLogger } from './lib/http/request-logger.js';
import type { Logger } from './lib/logger.js';
import { createRoutes } from './routes/index.js';

export const JSON_BODY_LIMIT = '100kb';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

/** Everything the app needs, injected so tests can pass fakes. No I/O at import time. */
export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  version: string;
  clock?: Clock;
  uptimeSeconds?: () => number;
  /** TODO(Phase 1): pass the Supabase JWT verifier from server.ts. */
  tokenVerifier?: TokenVerifier;
}

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp(deps: AppDeps): Express {
  const { config, logger } = deps;
  const clock = deps.clock ?? systemClock;

  const app = express();
  app.disable('x-powered-by');
  // Number of trusted proxy hops; 0 disables trust so X-Forwarded-For is ignored.
  app.set('trust proxy', config.trustProxyHops);

  app.use(requestId());
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(
    cors({
      // Native mobile requests have no Origin and are unaffected by CORS.
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
      exposedHeaders: ['x-request-id'],
      maxAge: 600,
    }),
  );
  app.use(
    createRateLimiter({
      windowMs: FIFTEEN_MINUTES_MS,
      limit: 300,
      skip: (path) => path === '/health',
    }),
  );
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use(
    createRoutes({
      version: deps.version,
      clock,
      uptimeSeconds: deps.uptimeSeconds ?? (() => process.uptime()),
      chatRateLimiter: createRateLimiter({ windowMs: ONE_MINUTE_MS, limit: 20 }),
      tokenVerifier: deps.tokenVerifier ?? notConfiguredTokenVerifier,
    }),
  );

  app.use(notFound());
  app.use(errorHandler());

  return app;
}
