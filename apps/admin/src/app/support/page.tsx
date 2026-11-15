import { Suspense } from 'react';
import { requireStaff } from '@/lib/require-staff';
import { SupportScreen } from '@/features/support/components/support-screen';
export default async function Page() {
  const staff = await requireStaff();
  return (
    <Suspense fallback={<p>Loading support…</p>}>
      <SupportScreen canBreakGlass={staff.role === 'super_admin'} />
    </Suspense>
  );
}
