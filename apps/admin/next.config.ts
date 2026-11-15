import { adminApiUrl } from './src/platform/config/env';
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dakly/ui'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${adminApiUrl()}/:path*` }];
  },
};
export default nextConfig;
