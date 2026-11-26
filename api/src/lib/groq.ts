import Groq, {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from 'groq-sdk';
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'groq-sdk/resources/chat/completions';
import { AiRateLimitedError, AiTimeoutError, AiUpstreamError, type AppError } from './errors.js';
import type { Logger } from './logger.js';

/** Voice replies should feel instant; fail fast instead of the SDK's 1-minute default. */
const REQUEST_TIMEOUT_MS = 20_000;
/**
 * SDK retries 408/409/5xx and connection errors with backoff + jitter. One
 * retry keeps worst-case voice latency bounded (each attempt can take the full timeout).
 * 429 is never retried: see `withoutRateLimitRetries`.
 */
const MAX_RETRIES = 1;

/** The SDK's `fetch` option shape. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Wraps `fetch` so the SDK never retries a 429. Groq's free tier answers 429
 * with `retry-after` of 10 to 20 seconds and the SDK would sleep that long:
 * for voice, an instant "I'm busy" (ai_rate_limited) beats 18 s of silence.
 * The SDK's retry check is private, but it obeys the `x-should-retry` header,
 * so we set it to `false` on 429 responses. Other statuses pass through untouched.
 */
export function withoutRateLimitRetries(fetchImpl: FetchLike = fetch): FetchLike {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    if (response.status !== 429) return response;
    const headers = new Headers(response.headers);
    headers.set('x-should-retry', 'false');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}

/**
 * The narrow slice of the Groq client our agents use. Tests pass a fake;
 * production passes `new Groq(...)`, which satisfies it structurally.
 */
export interface ModelClient {
  chat: {
    completions: {
      create(
        params: ChatCompletionCreateParamsNonStreaming,
        options?: { signal?: AbortSignal },
      ): PromiseLike<ChatCompletion>;
    };
  };
}

/** The SDK's logger shape: `(message, ...rest)` per level. */
interface SdkLogger {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
}

/**
 * Routes the SDK's own log lines into our logger so hidden SDK retries
 * (429/5xx/timeouts, which sleep for `retry-after` before retrying) show up in
 * the logs with their status and timing. At `info` the SDK logs only the
 * request ID, method, URL, status, duration and retry count. Its `debug`
 * lines include request bodies (user text), so `debug` is dropped and extra
 * arguments are never forwarded.
 */
export function createSdkLogger(logger: Logger): SdkLogger {
  const sdk = logger.child({ component: 'groq-sdk' });
  return {
    error: (message) => {
      sdk.error(message);
    },
    warn: (message) => {
      sdk.warn(message);
    },
    info: (message) => {
      sdk.info(message);
    },
    debug: () => undefined,
  };
}

/** Called once at startup (server.ts) when GROQ_API_KEY is set. `fetchImpl` is for tests. */
export function createGroqClient(apiKey: string, logger: Logger, fetchImpl?: FetchLike): ModelClient {
  return new Groq({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
    fetch: withoutRateLimitRetries(fetchImpl),
    logger: createSdkLogger(logger),
    logLevel: 'info',
  });
}

/** Groq echoes a request ID header; useful when contacting their support. */
function groqRequestId(headers: Headers | undefined): string | undefined {
  // `headers` is undefined for connection-level errors.
  return headers?.get('x-request-id') ?? undefined;
}

/**
 * Maps an SDK error to a client-safe domain error and logs it once with
 * context. Never logs the API key or user text.
 */
export function toAiError(err: unknown, logger: Logger, context: { requestId?: string; model: string }): AppError {
  if (err instanceof APIUserAbortError) {
    // The phone hung up; nobody is waiting for this response.
    logger.debug(context, 'model request aborted by client disconnect');
    return new AiUpstreamError(undefined, { cause: err });
  }

  if (!(err instanceof APIError)) {
    logger.error({ ...context, err }, 'model request failed');
    return new AiUpstreamError(undefined, { cause: err });
  }

  const upstream = {
    ...context,
    // `instanceof` narrows to APIError<any, ...>, so pin the field types.
    status: err.status as number | undefined,
    groqRequestId: groqRequestId(err.headers as Headers | undefined),
  };

  if (err instanceof APIConnectionTimeoutError) {
    logger.warn(upstream, 'model request timed out');
    return new AiTimeoutError(undefined, { cause: err });
  }
  if (err instanceof RateLimitError) {
    logger.warn(upstream, 'model provider rate limited the request');
    return new AiRateLimitedError(undefined, { cause: err });
  }
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
    logger.error(upstream, 'model provider rejected credentials; check GROQ_API_KEY');
    return new AiUpstreamError(undefined, { cause: err });
  }
  if (err instanceof NotFoundError || err instanceof BadRequestError || err instanceof UnprocessableEntityError) {
    // Most likely a bad GROQ_MODEL or a parameter the model does not support.
    // The SDK message holds the provider's explanation, never our key or the user's text.
    logger.error(
      { ...upstream, apiMessage: err.message },
      'model provider rejected the request; check GROQ_MODEL / GROQ_REASONING_EFFORT',
    );
    return new AiUpstreamError(undefined, { cause: err });
  }

  logger.error(upstream, 'model provider error');
  return new AiUpstreamError(undefined, { cause: err });
}
