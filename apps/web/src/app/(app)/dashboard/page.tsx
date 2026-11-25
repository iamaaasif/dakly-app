import { redirect } from 'next/navigation';

import { dashboardQuerySchema } from '@dakly/contracts/dashboard';

import { DashboardScreen } from './dashboard-screen';
import { SetupCard } from '@/features/setup-guide/components/setup-card';
import { requireSession } from '@/lib/require-session';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const session = await requireSession();
  if (!session.hasMemberships) redirect('/setup');
  const parsed = dashboardQuerySchema.safeParse({ period: (await searchParams).period });
  return (
    <DashboardScreen period={parsed.success ? parsed.data.period : 30} setupCard={<SetupCard />} />
  );
}
