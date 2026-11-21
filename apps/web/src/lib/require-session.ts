import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import type { SessionContext } from '@dakly/contracts/sessions';

import { signInPath } from './safe-next-path';
import { webApiUrl } from '@/platform/config/env';

// React cache deduplicates only this server render, never sessions across requests.
export const requireSession = cache(async (): Promise<SessionContext> => {
  const cookie = (await cookies()).get('dakly_session');
  if (!cookie) redirect(await signInPathForRequest());
  const response = await fetch(`${webApiUrl()}/me/context`, {
    headers: { Cookie: `dakly_session=${cookie.value}` },
    cache: 'no-store',
  });
  if (response.status === 401) redirect(await signInPathForRequest());
  if (!response.ok) throw new Error('Could not verify your account. Try again.');
  return response.json() as Promise<SessionContext>;
});

async function signInPathForRequest() {
  return signInPath((await headers()).get('x-dakly-path'));
}
