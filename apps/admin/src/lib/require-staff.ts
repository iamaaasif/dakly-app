import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminEnvironment } from '../platform/config/env';
export async function requireStaff(): Promise<void> {
  const incoming = await headers();
  const env = adminEnvironment();
  const origin = new URL(env.ADMIN_ORIGIN);
  const forwardedFor = incoming.get('x-forwarded-for');
  const response = await fetch(`${env.ADMIN_API_URL}/admin/auth/session`, {
    cache: 'no-store',
    headers: {
      cookie: incoming.get('cookie') ?? '',
      'x-forwarded-host': origin.host,
      'x-forwarded-proto': origin.protocol.slice(0, -1),
      ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      'cf-access-jwt-assertion': incoming.get('cf-access-jwt-assertion') ?? '',
    },
  });
  if (!response.ok) redirect('/sign-in');
}
