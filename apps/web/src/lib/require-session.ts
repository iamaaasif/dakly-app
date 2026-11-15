import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import type { SessionContext } from '@dakly/contracts/sessions';

import { webApiUrl } from '@/platform/config/env';

// React cache deduplicates only this server render, never sessions across requests.
export const requireSession = cache(async (): Promise<SessionContext> => {
  const cookie = (await cookies()).get('dakly_session');
  if (!cookie) redirect('/sign-in');
  const response = await fetch(`${webApiUrl()}/me/context`, {
    headers: { Cookie: `dakly_session=${cookie.value}` },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/sign-in');
  if (!response.ok) throw new Error('Could not verify your account. Try again.');
  return response.json() as Promise<SessionContext>;
});
