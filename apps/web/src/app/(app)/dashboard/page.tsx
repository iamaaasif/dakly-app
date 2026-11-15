import { redirect } from 'next/navigation';

import { Dashboard } from '@/features/dashboard/components/dashboard';
import { requireSession } from '@/lib/require-session';

export default async function DashboardPage() {
  const session = await requireSession();
  if (!session.hasMemberships) redirect('/setup');
  return <Dashboard />;
}
