import { Suspense } from 'react';

import { StorePage } from '@/components/store-page';
import { AuditLogScreen } from '@/features/audit-log/components/audit-log-screen';
import { requireSession } from '@/lib/require-session';

export default async function ActivityPage() {
  await requireSession();
  // The Owner flag is the one that gates Support access, which has the same audience.
  return (
    <Suspense fallback={<p className="p-6">Loading activity…</p>}>
      <StorePage permission="canApproveSupport">
        <AuditLogScreen />
      </StorePage>
    </Suspense>
  );
}
