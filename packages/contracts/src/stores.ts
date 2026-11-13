// Allowed values for the stores and team tables. The database CHECK constraints are built
// from these lists, so the API, the web app and Postgres accept exactly the same values.
export const extensions = ['chats', 'sales', 'social_auto_post', 'physical_shop'] as const;
export const howYouSellOptions = [
  'social_media',
  'online_store',
  'shop_with_pos',
  'shop_without_pos',
] as const;
export const customerListSizes = [
  'under_500',
  '500_to_2000',
  '2000_to_10000',
  'over_10000',
] as const;
export const storeStatuses = ['active', 'suspended', 'closing'] as const;
export const languages = ['en', 'bn'] as const;

// Built-in roles live in code (team/permissions.ts); the roles table holds custom roles only.
export const builtInRoles = ['owner', 'admin', 'marketer', 'support_agent'] as const;
export const membershipStatuses = ['invited', 'active', 'removed'] as const;
