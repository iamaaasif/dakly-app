import { Suspense } from 'react';
import { requireStaff } from '@/lib/require-staff';
import { AuditScreen } from '@/features/audit/components/audit-screen';
export default async function Page() {
  await requireStaff();
  return (
    <Suspense fallback={<p>Loading audit…</p>}>
      <AuditScreen />
    </Suspense>
  );
}
