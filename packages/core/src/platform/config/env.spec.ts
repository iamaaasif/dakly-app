import { randomBytes } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadEnv, loadStaffEnv, resetEnvForTests } from './env';

describe('loadEnv', () => {
  it.each(['https://localhost:6379', 'redis://localhost/-1', 'redis://localhost/1.5'])(
    'rejects unsupported REDIS_URL at startup: %s',
    (redisUrl) => {
      expect(() =>
        loadEnv({ DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: redisUrl }),
      ).toThrow();
    },
  );

  it('serves short links from the API until the short domain is set', () => {
    const base = { DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: 'redis://localhost' };
    expect(loadEnv(base).SHORT_LINK_BASE_URL).toBe('http://localhost:4000/l');
    expect(loadEnv({ ...base, SHORT_LINK_BASE_URL: 'https://dkly.test' }).SHORT_LINK_BASE_URL).toBe(
      'https://dkly.test',
    );
    expect(() => loadEnv({ ...base, SHORT_LINK_BASE_URL: 'https://dkly.test/' })).toThrow();
  });

  it("keeps BullMQ's queue prefix unless a test run sets its own", () => {
    const base = { DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: 'redis://localhost' };
    expect(loadEnv(base).QUEUE_PREFIX).toBe('bull');
    expect(loadEnv({ ...base, QUEUE_PREFIX: 'test-run' }).QUEUE_PREFIX).toBe('test-run');
  });
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

  it('requires staff Access and session configuration in production', () => {
    expect(() => loadStaffEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      'Staff Access and session configuration is required in production',
    );
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

describe('LLM driver configuration', () => {
  const base = { DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: 'redis://localhost' };

  it('refuses the scripted LLM driver in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', LLM_DRIVER: 'fake' })).toThrow(
      'LLM_DRIVER=fake is not allowed in production',
    );
  });

  it('accepts the scripted driver during development', () => {
    expect(loadEnv({ ...base, LLM_DRIVER: 'fake' }).LLM_DRIVER).toBe('fake');
  });

  it('requires an API key when selecting OpenAI', () => {
    expect(() => loadEnv({ ...base, LLM_DRIVER: 'openai' })).toThrow(
      'OPENAI_API_KEY is required for the OpenAI driver',
    );
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
    expect(() => loadStaffEnv({ ...configured, ...invalid })).toThrow(
      'Invalid encryption configuration',
    );
  });
});

describe('Staff environment configuration', () => {
  const configured = {
    DATABASE_URL: 'postgres://localhost/dakly',
    REDIS_URL: 'redis://localhost',
    NODE_ENV: 'production',
    ADMIN_ORIGIN: 'https://admin.dakly.test',
    CLOUDFLARE_ACCESS_ISSUER: 'https://dakly.cloudflareaccess.com',
    CLOUDFLARE_ACCESS_AUDIENCE: 'staff-app',
    STAFF_SESSION_SIGNING_KEY: randomBytes(32).toString('base64'),
    CODE_HASH_KEY: randomBytes(32).toString('base64'),
  };
  it('requires the code hash key in production only', () => {
    expect(() => loadStaffEnv({ ...configured, CODE_HASH_KEY: undefined })).toThrow(
      'CODE_HASH_KEY is required in production',
    );
    const development = { ...configured, NODE_ENV: 'development', CODE_HASH_KEY: undefined };
    expect(loadStaffEnv(development).CODE_HASH_KEY).toBeUndefined();
    expect(loadStaffEnv({ ...development, NODE_ENV: 'test' }).CODE_HASH_KEY).toBeUndefined();
  });
  it('accepts configured production verification and rejects development keys', () => {
    expect(loadStaffEnv(configured).ADMIN_ORIGIN).toBe(configured.ADMIN_ORIGIN);
    expect(() =>
      loadStaffEnv({ ...configured, CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS: '{"keys":[]}' }),
    ).toThrow('Development Access keys are not allowed');
  });
  it('rejects an insecure origin or an arbitrary JWKS issuer', () => {
    expect(() =>
      loadStaffEnv({ ...configured, ADMIN_ORIGIN: 'http://admin.dakly.test' }),
    ).toThrow();
    expect(() =>
      loadStaffEnv({ ...configured, CLOUDFLARE_ACCESS_ISSUER: 'https://attacker.test' }),
    ).toThrow();
  });
});

describe('API trusted proxy configuration', () => {
  const base = { DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: 'redis://localhost' };
  it('defaults to no trusted peers and accepts explicit IPs and CIDRs', () => {
    expect(loadEnv(base).API_TRUSTED_PROXIES).toEqual([]);
    expect(
      loadEnv({ ...base, API_TRUSTED_PROXIES: '127.0.0.1, 10.42.0.0/24, ::1, fd00::/64' })
        .API_TRUSTED_PROXIES,
    ).toEqual(['127.0.0.1', '10.42.0.0/24', '::1', 'fd00::/64']);
  });
  it.each([
    'true',
    '1',
    'loopback',
    'localhost',
    '*',
    '0.0.0.0/0',
    '::/0',
    '127.0.0.1/33',
    '::1/129',
    '10.0.0.1/-1',
    '127.0.0.1,',
    'fe80::1%eth0',
    '10.0.0.1/1.5',
  ])('refuses ambiguous or unrestricted trust: %s', (value) => {
    expect(() => loadEnv({ ...base, API_TRUSTED_PROXIES: value })).toThrow();
  });
});

describe('API listener configuration', () => {
  const base = { DATABASE_URL: 'postgres://localhost/dakly', REDIS_URL: 'redis://localhost' };
  it('preserves the production bind default and accepts explicit loopback IPs', () => {
    expect(loadEnv({ ...base, NODE_ENV: 'production' }).API_HOST).toBe('0.0.0.0');
    expect(loadEnv({ ...base, API_HOST: '127.0.0.1' }).API_HOST).toBe('127.0.0.1');
    expect(loadEnv({ ...base, API_HOST: '::1' }).API_HOST).toBe('::1');
  });
  it.each(['localhost', 'https://127.0.0.1', '', '127.0.0.1:4000'])(
    'rejects a non-IP bind address: %s',
    (host) => {
      expect(() => loadEnv({ ...base, API_HOST: host })).toThrow();
    },
  );
});

describe('process environment cache', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvForTests();
  });

  it.each([loadEnv, loadStaffEnv])('parses process.env once until reset', (load) => {
    vi.stubEnv('DATABASE_URL', 'postgres://localhost/dakly');
    vi.stubEnv('REDIS_URL', 'redis://localhost');
    vi.stubEnv('API_PORT', '4000');
    const first = load();
    vi.stubEnv('API_PORT', '5000');
    expect(load()).toBe(first);
    resetEnvForTests();
    expect(load().API_PORT).toBe(5000);
  });
});
