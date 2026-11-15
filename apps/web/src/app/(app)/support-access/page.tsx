import { StorePage } from '@/components/store-page';
import { requireSession } from '@/lib/require-session';
import { Suspense } from 'react';
import { OwnerSupport } from '@/features/support/components/owner-support';
export default async function Page() {
  await requireSession();
  return (
    <Suspense fallback={<p>Loading support requests…</p>}>
      <StorePage permission="canApproveSupport">
        <OwnerSupport />
      </StorePage>
    </Suspense>
  );
}
