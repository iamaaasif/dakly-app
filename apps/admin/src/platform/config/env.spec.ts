import { afterEach, describe, expect, it, vi } from 'vitest';

import { adminEnvironment } from './env';

describe('Admin origin configuration', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('requires explicit Access verification configuration', () => {
    vi.stubEnv('CLOUDFLARE_ACCESS_ISSUER', undefined);
    vi.stubEnv('CLOUDFLARE_ACCESS_AUDIENCE', undefined);
    expect(() => adminEnvironment()).toThrow();
  });
  it('never accepts development verification keys in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ADMIN_ORIGIN', 'https://admin.example.test');
    vi.stubEnv('CLOUDFLARE_ACCESS_ISSUER', 'https://dakly.cloudflareaccess.com');
    vi.stubEnv('CLOUDFLARE_ACCESS_AUDIENCE', 'staff-app');
    vi.stubEnv('CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS', '{"keys":[]}');
    expect(() => adminEnvironment()).toThrow('Production requires Cloudflare Access and HTTPS');
  });
});
