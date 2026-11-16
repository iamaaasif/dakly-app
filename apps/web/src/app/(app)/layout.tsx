import type { ReactNode } from 'react';

import { AppShell } from '@/components/app-shell';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { requireSession } from '@/lib/require-session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <AppShell bell={<NotificationBell />}>{children}</AppShell>;
}
