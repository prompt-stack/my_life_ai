import type { ErrorRequestHandler } from 'express';
import { AppError, type ErrorDetail } from '../errors.js';

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: ErrorDetail[];
  };
}

interface HttpErrorShape {
  statusCode: number;
  code: string;
  message: string;
  details?: ErrorDetail[] | undefined;
}

/**
 * body-parser (used by express.json) throws errors tagged with a `type`.
 * Map the ones a client can cause to stable codes.
 */
function fromBodyParserError(err: unknown): HttpErrorShape | undefined {
  if (typeof err !== 'object' || err === null || !('type' in err)) return undefined;

  switch (err.type) {
    case 'entity.parse.failed':
      return { statusCode: 400, code: 'invalid_json', message: 'Request body is not valid JSON' };
    case 'entity.too.large':
      return { statusCode: 413, code: 'payload_too_large', message: 'Request body is too large' };
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return { statusCode: 415, code: 'unsupported_encoding', message: 'Unsupported request encoding' };
    default:
      return undefined;
  }
}

function toHttpError(err: unknown): HttpErrorShape {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message, details: err.details };
  }
  return (
    fromBodyParserError(err) ?? {
      statusCode: 500,
      code: 'internal_error',
      // Never leak internal messages or stacks; details stay in the logs.
      message: 'An unexpected error occurred',
    }
  );
}

/**
 * Central error handler. Express 5 forwards rejected promises from async
 * handlers here automatically, so routes can simply `throw`.
 */
export function errorHandler(): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      // Response already streaming (e.g. SSE); let Express close the socket.
      next(err);
      return;
    }

    const httpError = toHttpError(err);

    if (httpError.statusCode === 500) {
      // Unexpected failure: attach to the response so pino-http writes a single
      // error log line (with stack) for this request, tagged with the request ID.
      res.err = err instanceof Error ? err : new Error(String(err));
    } else {
      // Expected outcome (4xx, 501): the request log line already records the status.
      req.log.debug({ code: httpError.code }, 'request rejected');
    }

    const body: ErrorBody = {
      error: {
        code: httpError.code,
        message: httpError.message,
        requestId: res.locals.requestId,
        ...(httpError.details ? { details: httpError.details } : {}),
      },
    };
    res.status(httpError.statusCode).json(body);
  };
}
