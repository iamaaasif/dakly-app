import { randomBytes } from 'node:crypto';
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

  it('parses production environment independently of consumer startup validation', () => {
    expect(loadEnv({ ...base, NODE_ENV: 'production' }).NODE_ENV).toBe('production');
  });

  it('rejects unsupported driver names', () => {
    expect(() => loadEnv({ ...base, SMS_DRIVER: 'unavailable' })).toThrow();
  });
});

describe('Google identity configuration', () => {
  const base = { DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: 'redis://localhost' };
  it('refuses fake Google identity in production', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', GOOGLE_IDENTITY_DRIVER: 'fake' }),
    ).toThrow();
  });
  it('requires an audience for the real Google verifier', () => {
    expect(() => loadEnv({ ...base, GOOGLE_IDENTITY_DRIVER: 'google' })).toThrow();
  });
});

describe('encryption configuration', () => {
  const base = { DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: 'redis://localhost' };
  const key = randomBytes(32).toString('base64');
  const configured = {
    ...base,
    ENCRYPTION_CURRENT_KEY_VERSION: '1',
    ENCRYPTION_MASTER_KEYS: JSON.stringify({ 1: key }),
  };

  it('accepts a selected key and retained decryption versions', () => {
    const environment = loadEnv({
      ...configured,
      ENCRYPTION_CURRENT_KEY_VERSION: '2',
      ENCRYPTION_MASTER_KEYS: JSON.stringify({ 1: key, 2: randomBytes(32).toString('base64') }),
    });
    expect(environment.encryption?.currentKeyVersion).toBe(2);
    expect(environment.encryption?.masterKeys.size).toBe(2);
  });

  it('leaves encryption unconfigured until a consumer requires it', () => {
    expect(loadEnv(base).encryption).toBeUndefined();
  });

  it.each([
    { ENCRYPTION_CURRENT_KEY_VERSION: undefined },
    { ENCRYPTION_MASTER_KEYS: undefined },
    { ENCRYPTION_CURRENT_KEY_VERSION: '0' },
    { ENCRYPTION_CURRENT_KEY_VERSION: '32768' },
    { ENCRYPTION_CURRENT_KEY_VERSION: '01' },
    { ENCRYPTION_CURRENT_KEY_VERSION: '1.5' },
    { ENCRYPTION_CURRENT_KEY_VERSION: '2' },
    { ENCRYPTION_MASTER_KEYS: '{}' },
    { ENCRYPTION_MASTER_KEYS: 'secret malformed JSON' },
    { ENCRYPTION_MASTER_KEYS: JSON.stringify({ 1: key.slice(0, -1) }) },
    { ENCRYPTION_MASTER_KEYS: JSON.stringify({ 1: randomBytes(31).toString('base64') }) },
    { ENCRYPTION_MASTER_KEYS: JSON.stringify({ 1: key, '01': key }) },
    { ENCRYPTION_MASTER_KEYS: JSON.stringify({ 1: key, 32768: key }) },
  ])('rejects invalid key configuration at startup without exposing key material', (invalid) => {
    expect(() => loadEnv({ ...configured, ...invalid })).toThrow(
      'Invalid encryption configuration',
    );
  });
});
