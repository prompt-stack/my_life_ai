import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from '../logger.js';

/**
 * One structured log line per request (method, url, status, latency, reqId).
 * Must be mounted after `requestId()` so `req.id` is already set.
 * Header redaction is configured on the base logger (see `REDACT_PATHS`).
 */
export function requestLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (req) => req.id,
    // `res.err` is only set for unexpected failures (see error-handler.ts), so a
    // 501 placeholder or a 4xx is a warning, not an error.
    customLogLevel: (_req, res, err) => {
      if (err !== undefined || res.err !== undefined) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // pino-http invents an Error (with a useless stack) for any status >= 500.
    // Drop it when no real error was attached, e.g. 501 placeholders.
    customErrorObject: (_req, res, _err, val: Record<string, unknown>) =>
      res.err === undefined ? { ...val, err: undefined } : val,
    customErrorMessage: (_req, res) => (res.err === undefined ? 'request completed' : 'request errored'),
    // Log only what we need. Never full headers: they can carry tokens/cookies,
    // and response headers are mostly static noise.
    serializers: {
      req: (req: { id: unknown; method: string; url: string; headers: Record<string, unknown> }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customProps: (_req, res) => {
      // `res.locals` is not on Node's ServerResponse type; read it defensively.
      const locals = (res as { locals?: Express.Locals }).locals;
      return locals?.auth ? { userId: locals.auth.userId } : {};
    },
  });
}
