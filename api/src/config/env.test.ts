import { describe, expect, it } from 'vitest';
import { DEFAULT_GROQ_MODEL, EnvValidationError, parseEnv } from './env.js';

describe('parseEnv', () => {
  it('applies defaults', () => {
    expect(parseEnv({})).toEqual({
      nodeEnv: 'development',
      isProduction: false,
      port: 3000,
      host: '0.0.0.0',
      logLevel: 'info',
      corsOrigins: [],
      trustProxyHops: 0,
      defaultTimezone: 'Asia/Manila',
      groq: {
        apiKey: undefined,
        model: DEFAULT_GROQ_MODEL,
        maxTokens: 1024,
        reasoningEffort: 'low',
      },
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

  describe('Groq settings', () => {
    it('defaults to openai/gpt-oss-20b', () => {
      expect(DEFAULT_GROQ_MODEL).toBe('openai/gpt-oss-20b');
    });

    it('parses the key, model, max tokens and reasoning effort', () => {
      const config = parseEnv({
        GROQ_API_KEY: 'test-key',
        GROQ_MODEL: 'openai/gpt-oss-120b',
        GROQ_MAX_TOKENS: '512',
        GROQ_REASONING_EFFORT: 'off',
      });

      expect(config.groq).toEqual({
        apiKey: 'test-key',
        model: 'openai/gpt-oss-120b',
        maxTokens: 512,
        reasoningEffort: 'off',
      });
    });

    it('treats an empty key as missing, so the API still starts', () => {
      expect(parseEnv({ GROQ_API_KEY: '' }).groq.apiKey).toBeUndefined();
    });

    it('accepts any non-empty model ID so models can be switched from .env', () => {
      expect(parseEnv({ GROQ_MODEL: ' some-future-model ' }).groq.model).toBe('some-future-model');
    });

    it('falls back to the default model when GROQ_MODEL is empty', () => {
      expect(parseEnv({ GROQ_MODEL: '' }).groq.model).toBe(DEFAULT_GROQ_MODEL);
    });

    it.each(['0', '-1', 'abc', '15', '8193', '10.5'])('rejects invalid GROQ_MAX_TOKENS %j', (value) => {
      expect(() => parseEnv({ GROQ_MAX_TOKENS: value })).toThrow(EnvValidationError);
    });

    it.each(['off', 'none', 'default', 'low', 'medium', 'high'] as const)('accepts GROQ_REASONING_EFFORT %j', (value) => {
      expect(parseEnv({ GROQ_REASONING_EFFORT: value }).groq.reasoningEffort).toBe(value);
    });

    it('rejects an unknown GROQ_REASONING_EFFORT', () => {
      expect(() => parseEnv({ GROQ_REASONING_EFFORT: 'turbo' })).toThrow(EnvValidationError);
    });

    it('does not echo the API key in validation errors', () => {
      try {
        parseEnv({ GROQ_API_KEY: 'super-secret-key', GROQ_REASONING_EFFORT: 'turbo' });
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(EnvValidationError);
        expect((err as Error).message).not.toContain('super-secret-key');
      }
    });
  });
});
