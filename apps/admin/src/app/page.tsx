import { StaffAlerts } from '@/features/alerts/components/staff-alerts';
import { StaffHome } from '@/features/auth/components/staff-home';
import { requireStaff } from '@/lib/require-staff';

export default async function HomePage() {
  const staff = await requireStaff();
  return (
    <>
      <StaffHome />
      {staff.role === 'super_admin' ? <StaffAlerts /> : null}
    </>
  );
}
