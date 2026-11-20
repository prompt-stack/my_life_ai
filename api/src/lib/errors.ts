/**
 * Typed domain errors. Services throw these; the central error handler in
 * `lib/http/error-handler.ts` maps them to HTTP responses. Services never deal
 * with HTTP status codes directly beyond declaring which error they mean.
 */

export interface ErrorDetail {
  path: string;
  message: string;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  /** Safe, client-facing details (e.g. which input field was invalid). Never secrets. */
  readonly details: ErrorDetail[] | undefined;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options?: { details?: ErrorDetail[]; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = options?.details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: ErrorDetail[]) {
    super(400, 'validation_error', message, details ? { details } : undefined);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'unauthorized') {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super(403, 'forbidden', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'not_found', message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(429, 'rate_limited', message);
  }
}

export class NotImplementedError extends AppError {
  constructor(message = 'This feature is not implemented yet') {
    super(501, 'not_implemented', message);
  }
}
