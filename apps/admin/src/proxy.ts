import { NextResponse, type NextRequest } from 'next/server';

import { CloudflareAccessDriver } from '@dakly/providers/cloudflare/access-driver';

import { adminEnvironment } from './platform/config/env';

let driver: CloudflareAccessDriver | undefined;
export async function proxy(request: NextRequest) {
  try {
    const env = adminEnvironment();
    // Next's URL can use its internal listener hostname behind the ingress.
    const origin = new URL(env.ADMIN_ORIGIN);
    const host = request.headers.get('host');
    if (
      !host ||
      !/^[a-zA-Z0-9.:[\]-]+$/.test(host) ||
      new URL(`${origin.protocol}//${host}`).host !== origin.host
    )
      throw new Error();
    driver ??= new CloudflareAccessDriver({
      issuer: env.CLOUDFLARE_ACCESS_ISSUER,
      audience: env.CLOUDFLARE_ACCESS_AUDIENCE,
      developmentKeys: env.CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS
        ? JSON.parse(env.CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS)
        : undefined,
    });
    await driver.verify(request.headers.get('cf-access-jwt-assertion') ?? '');
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return new NextResponse('Staff Access verification is required', { status: 403 });
  }
}
export const config = { matcher: '/:path*' };
