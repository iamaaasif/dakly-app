import { requireSession } from '@/lib/require-session';
import { Suspense } from 'react';
import { SecurityHistory } from '@/features/security/components/security-history';
export default async function Page() {
  await requireSession();
  return (
    <Suspense fallback={<p>Loading security history…</p>}>
      <SecurityHistory />
    </Suspense>
  );
}
