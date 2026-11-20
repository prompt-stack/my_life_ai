import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './env.js';

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv({})).toEqual({
      nodeEnv: 'development',
      isProduction: false,
      port: 3000,
      logLevel: 'info',
      corsOrigins: [],
      trustProxyHops: 0,
      defaultTimezone: 'Asia/Manila',
    });
  });

  it('parses provided values', () => {
    const config = parseEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      CORS_ORIGINS: 'https://a.example.com, https://b.example.com',
      TRUST_PROXY: '1',
    });

    expect(config.isProduction).toBe(true);
    expect(config.port).toBe(8080);
    expect(config.corsOrigins).toEqual(['https://a.example.com', 'https://b.example.com']);
    expect(config.trustProxyHops).toBe(1);
  });

  it('treats an empty PORT as unset', () => {
    expect(parseEnv({ PORT: '' }).port).toBe(3000);
  });

  it.each(['abc', '0', '70000', '3000.5'])('rejects invalid PORT %j', (port) => {
    expect(() => parseEnv({ PORT: port })).toThrow(EnvValidationError);
  });

  it('rejects an invalid timezone', () => {
    expect(() => parseEnv({ DEFAULT_TIMEZONE: 'Mars/Olympus' })).toThrow(EnvValidationError);
  });

  it('rejects a non-URL CORS origin', () => {
    expect(() => parseEnv({ CORS_ORIGINS: 'not a url' })).toThrow(EnvValidationError);
  });
});
