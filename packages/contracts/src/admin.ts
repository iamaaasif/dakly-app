export const staffRoles = [
  'super_admin',
  'support',
  'finance',
  'ops',
  'trust_safety',
  'analyst',
] as const;
export const staffStatuses = ['active', 'disabled'] as const;
export const supportGrantStatuses = [
  'requested',
  'approved',
  'denied',
  'ended',
  'expired',
] as const;
export const supportGrantAccess = ['read', 'write'] as const;
