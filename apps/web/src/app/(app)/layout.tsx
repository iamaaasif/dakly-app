import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { AskDaklyButton } from '@/features/assistant/components/ask-dakly-button';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { requireSession } from '@/lib/require-session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <AppShell
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
