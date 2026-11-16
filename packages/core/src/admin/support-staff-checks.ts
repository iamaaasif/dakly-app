import type { StaffIdentity } from '@dakly/contracts/staff-auth';

import type { Clock } from '../platform/clock';
import type { StaffIdentityService } from './staff-identity.service';
import { supportRoles } from './support-roles';
import { assertSupportParent } from './support-session';
import { supportError } from './support.errors';
import type { StaffParentSession, SupportStaff } from './support.repository';

type SupportStaffCheck = {
  storeId: string;
  clock: Clock;
  identities: StaffIdentityService;
  // Loaded only after the staff row passes, so a failed check reads and locks no parent row.
  findParent?: () => Promise<StaffParentSession | undefined>;
  roles?: StaffIdentity['role'][];
};

export async function assertSupportStaff(
  staff: SupportStaff | undefined,
  { storeId, clock, identities, findParent, roles = supportRoles }: SupportStaffCheck,
): Promise<SupportStaff> {
  if (!staff || staff.status !== 'active' || !staff.enrolledAt || !roles.includes(staff.role))
    throw supportError('SUPPORT_ENDED');
  if (findParent) assertSupportParent(await findParent(), clock.now());
  if (await identities.conflictsWithStore(storeId, staff.id)) throw supportError('SUPPORT_DENIED');
  return staff;
}
