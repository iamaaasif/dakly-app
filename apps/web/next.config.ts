import { webApiUrl } from './src/platform/config/env';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dakly/ui'],
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${webApiUrl()}/:path*` },
      { source: '/support/api/:path*', destination: `${webApiUrl()}/support/:path*` },
      { source: '/support/exchange', destination: `${webApiUrl()}/support/exchange` },
    ];
  },
};

export default nextConfig;
