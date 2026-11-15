import { afterEach, describe, expect, it, vi } from 'vitest';

import nextConfig from './next.config';
import { webApiUrl } from './src/platform/config/env';

afterEach(() => vi.unstubAllEnvs());
describe('shop API routing', () => {
  it('keeps support transport under its cookie path and points all routes at configured API origin', async () => {
    vi.stubEnv('WEB_API_URL', 'http://127.0.0.1:4010');
    const rewrites = await nextConfig.rewrites?.();
    expect(rewrites).toEqual(
      expect.arrayContaining([
        { source: '/api/:path*', destination: 'http://127.0.0.1:4010/:path*' },
        { source: '/support/api/:path*', destination: 'http://127.0.0.1:4010/support/:path*' },
        { source: '/support/exchange', destination: 'http://127.0.0.1:4010/support/exchange' },
      ]),
    );
  });
  it('defaults locally and refuses credentials, paths and non-HTTP destinations', () => {
    vi.stubEnv('WEB_API_URL', undefined);
    expect(webApiUrl()).toBe('http://localhost:4000');
    for (const url of [
      'http://user:secret@localhost:4000',
      'http://localhost:4000/path',
      'file:///tmp/api',
    ]) {
      vi.stubEnv('WEB_API_URL', url);
      expect(() => webApiUrl()).toThrow();
    }
  });
});
