import { Suspense } from 'react';

import { StorePage } from '@/components/store-page';
import { OwnerSupport } from '@/features/support/components/owner-support';
import { requireSession } from '@/lib/require-session';

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
