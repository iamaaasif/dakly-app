import type { StaffIdentity } from '@dakly/contracts/staff-auth';

export const supportRoles: StaffIdentity['role'][] = ['super_admin', 'support', 'trust_safety'];
export const walletCreditRoles: StaffIdentity['role'][] = ['super_admin', 'support'];
// Feature 12 puts messaging providers and sender names with super admins and ops.
export const smsSenderReviewRoles: StaffIdentity['role'][] = ['super_admin', 'ops'];
// Feature 12: ops and super admins change providers and kill switches; analysts can only view.
export const killSwitchRoles: StaffIdentity['role'][] = ['super_admin', 'ops'];
export const killSwitchViewRoles: StaffIdentity['role'][] = ['super_admin', 'ops', 'analyst'];
