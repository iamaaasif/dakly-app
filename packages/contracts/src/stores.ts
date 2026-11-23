import { z } from 'zod';

import { billingCycles } from './billing';
import { bdMobileSchema } from './phone';
import { MAX_STOCK_QUANTITY } from './products';

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

const smsDailyLimitSchema = z.strictObject({
  on: z.boolean().default(true),
  perDay: z.number().int().min(1).max(1_000_000).default(2000),
});
// SMS rules from the SMS settings tab. Off for quiet hours only frees marketing SMS; the other
// channels keep their hours. The limit counts marketing SMS sent since local midnight.
const smsSendingSchema = z.strictObject({
  quietHoursOn: z.boolean().default(true),
  dailyLimit: smsDailyLimitSchema.default({ on: true, perDay: 2000 }),
});

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
  // Feature 09: while on, only an Owner or Admin approves a campaign.
  onlyOwnersAndAdminsApprove: z.boolean().default(true),
  sms: smsSendingSchema.default({ quietHoursOn: true, dailyLimit: { on: true, perDay: 2000 } }),
});
export type SendingSettings = z.infer<typeof sendingSettingsSchema>;

export const stockSettingsSchema = z.strictObject({
  lowStockThreshold: z.number().int().min(0).max(MAX_STOCK_QUANTITY).default(3),
});
type StockSettings = z.infer<typeof stockSettingsSchema>;

// Feature 13 rule 2: the SMS to the customer when baki is added, on unless the shop turns it off.
export const dueBookSettingsSchema = z.strictObject({
  bakiNoticeEnabled: z.boolean().default(true),
});
type DueBookSettings = z.infer<typeof dueBookSettingsSchema>;

export const storeOfferings = ['products', 'services', 'both'] as const;
// Owners type "facebook.com/yourpage"; a missing scheme becomes https.
export const websiteUrlSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i)
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`));

export const createStoreSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  businessType: z.string().trim().min(1).max(100),
  district: z.string().trim().min(1).max(100),
  howYouSell: z.array(z.enum(howYouSellOptions)).min(1).max(4),
  customerListSize: z.enum(customerListSizes),
  planCode: z.string().trim().min(1).max(100),
  billingCycle: z.enum(billingCycles),
  websiteUrl: websiteUrlSchema.optional(),
  offering: z.enum(storeOfferings).optional(),
});
export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type SetupProfile = {
  howYouSell: (typeof howYouSellOptions)[number][];
  extensions: string[];
  guideHidden: boolean;
};
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
    // The whole section, as GET /store returns it, so a save never resets a part to its default.
    sending: sendingSettingsSchema
      .required()
      .extend({
        sms: smsSendingSchema.required().extend({ dailyLimit: smsDailyLimitSchema.required() }),
      })
      .optional(),
    stock: stockSettingsSchema.required().optional(),
    dueBook: dueBookSettingsSchema.required().optional(),
  })
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    'Choose a setting to change',
  );
export type ChangeStoreSettingsInput = z.infer<typeof changeStoreSettingsSchema>;

export const changeStoreExtensionsSchema = z.strictObject({
  extensions: z
    .array(z.enum(['chats', 'sales', 'social_auto_post', 'physical_shop']))
    .max(4)
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
  stock: StockSettings;
  dueBook: DueBookSettings;
};

export const attributionWindowSchema = z.union([z.literal(1), z.literal(3), z.literal(7)]);
export type AttributionWindow = z.infer<typeof attributionWindowSchema>;

export const changeAttributionWindowSchema = z.strictObject({
  windowDays: attributionWindowSchema,
});
export type ChangeAttributionWindowInput = z.infer<typeof changeAttributionWindowSchema>;
export type AttributionSettingsResponse = {
  windowDays: AttributionWindow;
  rebuilding: boolean;
  processedOrders: number | null;
};
