import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it.each(['https://localhost:6379', 'redis://localhost/-1', 'redis://localhost/1.5'])(
    'rejects unsupported REDIS_URL at startup: %s',
    (redisUrl) => {
      expect(() =>
        loadEnv({ DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: redisUrl }),
      ).toThrow();
    },
  );
});

describe('SMS driver configuration', () => {
  const base = { DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: 'redis://localhost' };

  it('rejects Mailpit in production at startup', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', SMS_DRIVER: 'mailpit' })).toThrow();
  });

  it('accepts Mailpit during development', () => {
    expect(loadEnv({ ...base, SMS_DRIVER: 'mailpit' })).toMatchObject({
      SMS_DRIVER: 'mailpit',
      MAILPIT_SMTP_HOST: '127.0.0.1',
      MAILPIT_SMTP_PORT: 1025,
    });
  });

  it('allows production without an SMS selection until there is an SMS consumer', () => {
    expect(loadEnv({ ...base, NODE_ENV: 'production' }).NODE_ENV).toBe('production');
  });

  it('rejects unsupported driver names', () => {
    expect(() => loadEnv({ ...base, SMS_DRIVER: 'unavailable' })).toThrow();
  });
});
