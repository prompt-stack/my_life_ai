import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

// Accept a caller-supplied ID only if it is short and log-safe; otherwise mint
// one. This prevents log injection through a crafted header.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export function resolveRequestId(incoming: string | undefined): string {
  if (incoming !== undefined && SAFE_REQUEST_ID.test(incoming)) {
    return incoming;
  }
  return randomUUID();
}

/** Assigns a request ID (x-request-id in/out) before anything else runs. */
export function requestId(): RequestHandler {
  return (req, res, next) => {
    const id = resolveRequestId(req.get(REQUEST_ID_HEADER));
    // `req.id` is what pino-http uses as `reqId` in every log line.
    req.id = id;
    res.locals.requestId = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  };
}
