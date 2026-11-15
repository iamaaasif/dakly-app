import type { NextConfig } from 'next';

import { adminApiUrl } from './src/platform/config/env';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dakly/ui'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${adminApiUrl()}/:path*` }];
  },
};
export default nextConfig;
