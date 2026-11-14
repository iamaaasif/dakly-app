import { z } from 'zod';
import { billingCycles } from './billing';

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

// Per member, per store. Fix now cards go out as push or SMS when unopened (NOTIF-R2).
export const notificationPreferencesSchema = z.strictObject({
  fixNowAlertAfterMinutes: z.number().int().min(15).max(1440).default(120),
  fixNowAlertChannels: z.array(z.enum(['push', 'sms'])).default(['push', 'sms']),
  digest: z.enum(['off', 'daily', 'weekly']).default('daily'),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const createStoreSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  businessType: z.string().trim().min(1).max(100),
  district: z.string().trim().min(1).max(100),
  howYouSell: z.array(z.enum(howYouSellOptions)).min(1).max(4),
  customerListSize: z.enum(customerListSizes),
  planCode: z.string().trim().min(1).max(100),
  billingCycle: z.enum(billingCycles),
});
export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type StoreResponse = { id: string; name: string; slug: string | null; extensions: string[] };
