import type { StaffIdentity } from '@dakly/contracts/staff-auth';

export const supportRoles: StaffIdentity['role'][] = ['super_admin', 'support', 'trust_safety'];
export const walletCreditRoles: StaffIdentity['role'][] = ['super_admin', 'support'];
