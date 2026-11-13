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
export const abuseReportSources = ['provider', 'customer', 'staff', 'system'] as const;
export const abuseReportCategories = [
  'spam',
  'ignored_opt_out',
  'fraud',
  'prohibited_content',
  'other',
] as const;
export const abuseReportStatuses = ['open', 'actioned', 'dismissed'] as const;
