import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { AskDaklyButton } from '@/features/assistant/components/ask-dakly-button';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { requireSession } from '@/lib/require-session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const path = ((await headers()).get('x-dakly-path') ?? '').split('?')[0];
  // A user with no shop at all creates one in onboarding; the redirect happens before any paint.
  if (!session.hasMemberships && path !== '/setup' && path !== '/security') redirect('/setup');
  return (
    <AppShell
      initialContext={session}
      actions={
        <>
          <AskDaklyButton />
          <NotificationBell />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
