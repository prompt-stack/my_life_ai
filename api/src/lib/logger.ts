import { pino, type DestinationStream, type Logger, type LevelWithSilent } from 'pino';

export type { Logger };

/**
 * Paths that must never reach the logs (rule: never log tokens, keys, JWTs,
 * OAuth tokens or email bodies). Extend this list as new sensitive fields appear.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'authorization',
  'cookie',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'apiKey',
  'password',
  'secret',
  '*.authorization',
  '*.cookie',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.apiKey',
  '*.password',
  '*.secret',
];

export interface LoggerOptions {
  level: LevelWithSilent;
  /** Defaults to stdout; tests pass an in-memory stream. */
  destination?: DestinationStream;
}

export function createLogger(options: LoggerOptions): Logger {
  const pinoOptions = {
    level: options.level,
    base: { service: 'mylife-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  };
  // Without a destination pino uses its default stdout stream.
  return options.destination ? pino(pinoOptions, options.destination) : pino(pinoOptions);
}
