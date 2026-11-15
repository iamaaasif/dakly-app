import { Suspense } from 'react';

import { StorePage } from '@/components/store-page';
import { OwnerSupport } from '@/features/support/components/owner-support';
import { requireSession } from '@/lib/require-session';

export default async function Page() {
  const session = await requireSession();
  if (!session.currentStore?.canApproveSupport)
    return (
      <p role="status" className="p-6">
        Only the shop Owner can manage support access.
      </p>
    );
  return (
    <Suspense fallback={<p>Loading support requests…</p>}>
      <StorePage permission="canApproveSupport">
        <OwnerSupport />
      </StorePage>
    </Suspense>
  );
}
