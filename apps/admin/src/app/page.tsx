import { StaffHome } from '@/features/auth/components/staff-home';
import { requireStaff } from '@/lib/require-staff';
export default async function HomePage() {
  await requireStaff();
  return <StaffHome />;
}
