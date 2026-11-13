import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('API rewrite', () => {
  it('forwards the same-origin API path to the local API', async () => {
    const rewrites = await nextConfig.rewrites?.();
    expect(rewrites).toEqual([
      { source: '/api/:path*', destination: 'http://localhost:4000/:path*' },
    ]);
  });
});
