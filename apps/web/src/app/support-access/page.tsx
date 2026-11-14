import { Suspense } from 'react';
import { OwnerSupport } from '@/features/support/components/owner-support';
export default function Page() {
  return (
    <Suspense fallback={<p>Loading support requests…</p>}>
      <OwnerSupport />
    </Suspense>
  );
}
