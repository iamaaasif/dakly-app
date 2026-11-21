import { Suspense } from 'react';

import { ShopsScreen } from '@/features/shops/components/shops-screen';
import { requireStaff } from '@/lib/require-staff';

export default async function Page() {
  await requireStaff();
  return (
    <Suspense fallback={<p>Loading shops…</p>}>
      <ShopsScreen />
    </Suspense>
  );
}
