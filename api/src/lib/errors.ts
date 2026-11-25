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

/** The AI provider is not configured on this server (e.g. GROQ_API_KEY missing). */
export class AiNotConfiguredError extends AppError {
  constructor(message = 'The assistant is not available right now') {
    super(503, 'ai_not_configured', message);
  }
}

/** The AI provider rate-limited us; the client may retry later. */
export class AiRateLimitedError extends AppError {
  constructor(message = 'The assistant is busy, please try again in a moment', options?: { cause?: unknown }) {
    super(429, 'ai_rate_limited', message, options);
  }
}

/** The AI provider timed out. */
export class AiTimeoutError extends AppError {
  constructor(message = 'The assistant took too long to answer, please try again', options?: { cause?: unknown }) {
    super(504, 'ai_timeout', message, options);
  }
}

/** Any other AI provider failure (network, 5xx, overloaded, bad model ID, auth). */
export class AiUpstreamError extends AppError {
  constructor(message = 'The assistant could not answer right now, please try again', options?: { cause?: unknown }) {
    super(502, 'ai_upstream_error', message, options);
  }
}
