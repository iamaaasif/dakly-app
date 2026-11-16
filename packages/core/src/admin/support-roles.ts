import type { StaffIdentity } from '@dakly/contracts/staff-auth';

export const supportRoles: StaffIdentity['role'][] = ['super_admin', 'support', 'trust_safety'];
export const walletCreditRoles: StaffIdentity['role'][] = ['super_admin', 'support'];
// Feature 12 puts messaging providers and sender names with super admins and ops.
export const smsSenderReviewRoles: StaffIdentity['role'][] = ['super_admin', 'ops'];
