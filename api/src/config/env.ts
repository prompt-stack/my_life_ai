import { z } from 'zod';
import { isValidTimeZone } from '../lib/time.js';

/**
 * Environment schema. `process.env` is parsed exactly once at startup (in
 * `server.ts`) and the typed result is passed down. Nothing else reads
 * `process.env`. Future keys are listed (commented) in `.env.example`.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .pipe(z.array(z.url())),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  DEFAULT_TIMEZONE: z
    .string()
    .default('Asia/Manila')
    .refine(isValidTimeZone, { message: 'Must be a valid IANA timezone' }),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  nodeEnv: Env['NODE_ENV'];
  isProduction: boolean;
  port: number;
  logLevel: Env['LOG_LEVEL'];
  corsOrigins: string[];
  trustProxyHops: number;
  defaultTimezone: string;
}

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

type EnvSource = Record<string, string | undefined>;

/** Treat empty strings as "unset" so `PORT=` in a .env file falls back to the default. */
function dropEmptyValues(source: EnvSource): EnvSource {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
}

export function parseEnv(source: EnvSource): AppConfig {
  const result = envSchema.safeParse(dropEmptyValues(source));
  if (!result.success) {
    throw new EnvValidationError(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }

  const env = result.data;
  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    corsOrigins: env.CORS_ORIGINS,
    trustProxyHops: env.TRUST_PROXY,
    defaultTimezone: env.DEFAULT_TIMEZONE,
  };
}
