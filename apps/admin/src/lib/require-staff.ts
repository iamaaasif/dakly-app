import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminEnvironment } from '../platform/config/env';
export async function requireStaff(): Promise<void> {
  const incoming = await headers();
  const env = adminEnvironment();
  const response = await fetch(`${env.ADMIN_API_URL}/admin/auth/session`, {
    cache: 'no-store',
    headers: {
      cookie: incoming.get('cookie') ?? '',
      host: new URL(env.ADMIN_ORIGIN).host,
      'cf-access-jwt-assertion': incoming.get('cf-access-jwt-assertion') ?? '',
    },
  });
  if (!response.ok) redirect('/sign-in');
}
