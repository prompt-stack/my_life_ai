import type { RequestHandler } from 'express';
import { NotFoundError } from '../errors.js';

/** Catch-all for unmatched routes; forwards to the central error handler. */
export function notFound(): RequestHandler {
  return (_req, _res, next) => {
    next(new NotFoundError('Route not found'));
  };
}
