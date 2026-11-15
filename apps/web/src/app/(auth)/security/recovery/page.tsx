import type { Metadata } from 'next';
import { RecoveryScreen } from '@/features/auth/components/recovery-screen';
export const metadata: Metadata = { referrer: 'no-referrer' };
export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return <RecoveryScreen view={view === 'complete' ? 'complete' : 'request'} />;
}
