import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { ValidationError, type ErrorDetail } from '../errors.js';

export interface RequestSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

type RequestPart = keyof RequestSchemas;

const MAX_REPORTED_ISSUES = 10;

function toDetails(part: RequestPart, error: z.ZodError): ErrorDetail[] {
  return error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => ({
    path: [part, ...issue.path.map(String)].join('.'),
    message: issue.message,
  }));
}

/**
 * Validates request parts with Zod. Parsed values are stored on
 * `res.locals.validated` (Express 5 makes `req.query` read-only, so we never
 * mutate the raw request). Use `.strict()` schemas to reject unknown fields.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, res, next) => {
    const validated: NonNullable<Express.Locals['validated']> = {};
    const details: ErrorDetail[] = [];

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (result.success) {
        validated[part] = result.data;
      } else {
        details.push(...toDetails(part, result.error));
      }
    }

    if (details.length > 0) {
      next(new ValidationError('Request validation failed', details));
      return;
    }

    res.locals.validated = validated;
    next();
  };
}
