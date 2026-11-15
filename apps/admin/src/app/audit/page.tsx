import { Suspense } from 'react';

import { AuditScreen } from '@/features/audit/components/audit-screen';
import { requireStaff } from '@/lib/require-staff';

export default async function Page() {
  await requireStaff();
  return (
    <Suspense fallback={<p>Loading audit…</p>}>
      <AuditScreen />
    </Suspense>
  );
}
