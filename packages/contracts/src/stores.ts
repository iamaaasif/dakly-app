import { z } from 'zod';

import { billingCycles } from './billing';
import { bdMobileSchema } from './phone';

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

// The settings.sending section. Quiet hours are whole hours in store time and always span
// midnight (feature 09 allows 8-10 pm to 8-10 am); the cap follows CAMP-R3 and D41.
export const sendingSettingsSchema = z.strictObject({
  quietHours: z
    .strictObject({
      startHour: z.number().int().min(20).max(22),
      endHour: z.number().int().min(8).max(10),
    })
    .default({ startHour: 21, endHour: 9 }),
  frequencyCap: z
    .strictObject({
      perChannelPerDay: z.number().int().min(1).max(3),
      perSevenDays: z.number().int().min(1).max(10),
    })
    .default({ perChannelPerDay: 1, perSevenDays: 3 }),
});
export type SendingSettings = z.infer<typeof sendingSettingsSchema>;

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

export const changeStoreSettingsSchema = z
  .strictObject({
    name: createStoreSchema.shape.name.optional(),
    legalName: z.string().trim().min(1).max(200).nullable().optional(),
    businessType: createStoreSchema.shape.businessType.nullable().optional(),
    phone: bdMobileSchema.nullable().optional(),
    email: z.email().max(254).nullable().optional(),
    address: z.string().trim().min(1).max(1000).nullable().optional(),
    district: createStoreSchema.shape.district.nullable().optional(),
    vatBin: z
      .string()
      .regex(/^[0-9]{13}$/)
      .nullable()
      .optional(),
    tradeLicenceNumber: z.string().trim().min(1).max(100).nullable().optional(),
    // Replaces the whole section; a part left out returns to its default.
    sending: sendingSettingsSchema.optional(),
  })
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    'Choose a setting to change',
  );
export type ChangeStoreSettingsInput = z.infer<typeof changeStoreSettingsSchema>;

export const changeStoreExtensionsSchema = z.strictObject({
  extensions: z
    .array(z.enum(['chats', 'sales', 'social_auto_post']))
    .max(3)
    .refine((values) => new Set(values).size === values.length, 'Choose each extension once'),
});
export type ChangeStoreExtensionsInput = z.infer<typeof changeStoreExtensionsSchema>;

export type StoreSettingsResponse = StoreResponse & {
  legalName: string | null;
  businessType: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  district: string | null;
  vatBin: string | null;
  tradeLicenceNumber: string | null;
  sending: SendingSettings;
};
