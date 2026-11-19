import { redirect } from 'next/navigation';

import { dashboardQuerySchema } from '@dakly/contracts/dashboard';

import { Dashboard } from '@/features/dashboard/components/dashboard';
import { requireSession } from '@/lib/require-session';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const session = await requireSession();
  if (!session.hasMemberships) redirect('/setup');
  const parsed = dashboardQuerySchema.safeParse({ period: (await searchParams).period });
  return <Dashboard period={parsed.success ? parsed.data.period : 30} />;
}
