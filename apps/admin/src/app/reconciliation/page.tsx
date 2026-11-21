import { Suspense } from 'react';

import { ReconciliationScreen } from '@/features/reconciliation/components/reconciliation-screen';
import { requireStaff } from '@/lib/require-staff';

export default async function Page() {
  const staff = await requireStaff();
  return (
    <Suspense fallback={<p>Loading the reconciliation queue…</p>}>
      <ReconciliationScreen role={staff.role} />
    </Suspense>
  );
}
