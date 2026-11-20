import express, { type Express, type Router } from 'express';
import { createApp, type AppDeps } from '../app.js';
import { parseEnv } from '../config/env.js';
import { errorHandler } from '../lib/http/error-handler.js';
import { notFound } from '../lib/http/not-found.js';
import { requestId } from '../lib/http/request-id.js';
import { requestLogger } from '../lib/http/request-logger.js';
import { createLogger } from '../lib/logger.js';

export const FIXED_NOW = new Date('2026-01-02T01:30:00.000Z');

export const silentLogger = createLogger({ level: 'silent' });

export function buildTestApp(overrides: Partial<AppDeps> = {}): Express {
  return createApp({
    config: parseEnv({ NODE_ENV: 'test', CORS_ORIGINS: 'https://dashboard.example.com' }),
    logger: silentLogger,
    version: '0.0.0-test',
    clock: { now: () => FIXED_NOW },
    uptimeSeconds: () => 42.7,
    ...overrides,
  });
}

/** Minimal app with the real request-id/logging/error pipeline around a test-only router. */
export function buildRouterTestApp(router: Router): Express {
  const app = express();
  app.use(requestId());
  app.use(requestLogger(silentLogger));
  app.use(express.json());
  app.use(router);
  app.use(notFound());
  app.use(errorHandler());
  return app;
}
