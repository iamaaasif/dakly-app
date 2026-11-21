import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { safeNextPath } from './safe-next-path';
import { webApiUrl } from '@/platform/config/env';

// Someone with a live session has no reason to see the sign-in or sign-up forms.
export async function redirectIfSignedIn(next?: string): Promise<void> {
  const cookie = (await cookies()).get('dakly_session');
  if (!cookie) return;
  const response = await fetch(`${webApiUrl()}/me/context`, {
    headers: { Cookie: `dakly_session=${cookie.value}` },
    cache: 'no-store',
  }).catch(() => undefined);
  if (response?.ok) redirect(safeNextPath(next) ?? '/dashboard');
}
