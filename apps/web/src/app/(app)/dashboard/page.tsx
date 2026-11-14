import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/require-session';
import { Dashboard } from '@/features/dashboard/components/dashboard';
export default async function DashboardPage() {
  const session = await requireSession();
  if (!session.stores.length) redirect('/setup');
  return <Dashboard />;
}
