import { Suspense } from 'react';
import { SecurityHistory } from '@/features/security/components/security-history';
export default function Page() {
  return (
    <Suspense fallback={<p>Loading security history…</p>}>
      <SecurityHistory />
    </Suspense>
  );
}
