import { afterEach, describe, expect, it, vi } from 'vitest';

import { webAuthConfig } from './env';

afterEach(() => vi.unstubAllEnvs());
describe('Registration configuration', () => {
  it('does not invent a legal version when documents are absent', () => {
    for (const key of [
      'WEB_TERMS_URL',
      'WEB_PRIVACY_URL',
      'WEB_TERMS_VERSION',
      'WEB_GOOGLE_CLIENT_ID',
    ])
      vi.stubEnv(key, '');
    expect(webAuthConfig()).toEqual({ legal: null, googleClientId: null });
  });
  it('rejects unsafe document schemes and invalid Google client identifiers', () => {
    vi.stubEnv('WEB_TERMS_URL', 'javascript:alert(1)');
    vi.stubEnv('WEB_PRIVACY_URL', 'https://example.test/privacy');
    vi.stubEnv('WEB_TERMS_VERSION', 'v1');
    expect(() => webAuthConfig()).toThrow();
    vi.stubEnv('WEB_TERMS_URL', 'https://example.test/terms');
    vi.stubEnv('WEB_GOOGLE_CLIENT_ID', 'invalid-client');
    expect(() => webAuthConfig()).toThrow();
  });
});
