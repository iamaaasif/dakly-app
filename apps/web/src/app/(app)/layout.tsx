import { requireSession } from '@/lib/require-session';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <AppShell>{children}</AppShell>;
}
