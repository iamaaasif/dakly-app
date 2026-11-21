import { Suspense } from 'react';

import { PlansScreen } from '@/features/plans/components/plans-screen';
import { requireStaff } from '@/lib/require-staff';

export default async function Page() {
  const staff = await requireStaff();
  return (
    <Suspense fallback={<p>Loading plans…</p>}>
      <PlansScreen role={staff.role} />
    </Suspense>
  );
}
