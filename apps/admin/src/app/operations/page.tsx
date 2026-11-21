import { Suspense } from 'react';

import { OperationsScreen } from '@/features/operations/components/operations-screen';
import { requireStaff } from '@/lib/require-staff';

export default async function Page() {
  const staff = await requireStaff();
  return (
    <Suspense fallback={<p>Loading operations…</p>}>
      <OperationsScreen role={staff.role} />
    </Suspense>
  );
}
