import type { NextConfig } from 'next';

import { webApiUrl } from './src/platform/config/env';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dakly/ui'],
  // Go live grades up to five test questions in one request; the 30 second default would cut it off.
  experimental: { proxyTimeout: 180_000 },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${webApiUrl()}/:path*` },
      { source: '/support/api/:path*', destination: `${webApiUrl()}/support/:path*` },
      { source: '/support/exchange', destination: `${webApiUrl()}/support/exchange` },
    ];
  },
};

export default nextConfig;
