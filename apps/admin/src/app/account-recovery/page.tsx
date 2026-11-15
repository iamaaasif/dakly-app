import { RecoveryScreen } from '@/features/recovery/components/recovery-screen';
import { requireStaff } from '@/lib/require-staff';

export default async function Page() {
  const staff = await requireStaff();
  if (!['support', 'super_admin'].includes(staff.role)) return <p>Support access is required.</p>;
  return <RecoveryScreen />;
}
