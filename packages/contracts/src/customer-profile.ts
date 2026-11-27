import { z } from 'zod';

import type { CampaignChannel } from './campaigns';
import type {
  ConsentChannel,
  ConsentSource,
  ConsentStatus,
  ContactKind,
  ContactSource,
  lifecycleStages,
} from './contacts';
import type { OrderStage, orderPaymentStatuses, orderSources } from './orders';

// A page is read newest first. The cursor is the last row's time and key from the page before.
const pageCursor = z
  .string()
  .max(80)
  .regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\|[\w:-]{1,60}$/, 'Not a page cursor');

export const customerProfilePageQuerySchema = z.strictObject({
  cursor: pageCursor.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CustomerProfilePageQuery = z.infer<typeof customerProfilePageQuerySchema>;

export const addCustomerNoteSchema = z.strictObject({ body: z.string().trim().min(1).max(2000) });
export type AddCustomerNoteInput = z.infer<typeof addCustomerNoteSchema>;

// Staff can switch only the channels where a staff answer is valid. Email waits for email
// campaigns (D20) and Messenger or Instagram consent must come from the customer.
export const marketingConsentChannels = ['whatsapp', 'sms'] as const;
export const marketingConsentChannelSchema = z.enum(marketingConsentChannels);
export const setMarketingConsentSchema = z.strictObject({
  subscribed: z.boolean(),
  note: z.string().trim().min(1).max(500).optional(),
});
export type SetMarketingConsentInput = z.infer<typeof setMarketingConsentSchema>;

export type CustomerPage<Item> = { items: Item[]; nextCursor: string | null };

export type CustomerSummaryResponse = {
  id: string;
  name: string | null;
  kind: ContactKind;
  lifecycleStage: (typeof lifecycleStages)[number];
  // Masked like the other contact routes for members without See full phone numbers.
  phone: string | null;
  whatsappPhone: string | null;
  email: string | null;
  address: string | null;
  district: string | null;
  source: ContactSource;
  tags: string[];
  favouriteCategory: string | null;
  createdAt: string;
  totalSpendPoisha: number;
  ordersCount: number;
  // Net spend over orders; null until there is a first order.
  averageOrderPoisha: number | null;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  // Net spend to date (glossary). The screen says "Not enough data yet" while it is null.
  lifetimeValuePoisha: number | null;
};

export type CustomerOrderResponse = {
  id: string;
  number: number;
  createdAt: string;
  source: (typeof orderSources)[number];
  stage: OrderStage;
  paymentStatus: (typeof orderPaymentStatuses)[number];
  totalPoisha: number;
  firstItemName: string;
  firstItemVariantTitle: string;
  // Lines after the first, for "+2 more".
  otherItemCount: number;
  photoUrl: string | null;
};

export const customerActivityKinds = [
  'order_placed',
  'order_delivered',
  'order_returned',
  'order_cancelled',
  'campaign_sent',
  'campaign_read',
  'campaign_tapped',
  'automation_entered',
  'consent_changed',
  'note_added',
] as const;
export type CustomerActivityKind = (typeof customerActivityKinds)[number];

// One row of the timeline. The screen writes the sentence; `subject` is what it names: an order
// number, a campaign or workflow name, a channel, or nothing for a note.
export type CustomerActivityResponse = {
  id: string;
  kind: CustomerActivityKind;
  at: string;
  subject: string | null;
  channel: CampaignChannel | ConsentChannel | null;
  consentStatus: ConsentStatus | null;
  consentSource: ConsentSource | null;
};

export const customerCampaignResults = [
  'tapped',
  'read',
  'delivered',
  'sent',
  'failed',
  'skipped',
] as const;

export type CustomerCampaignResponse = {
  recipientId: string;
  campaignId: string;
  name: string;
  channel: CampaignChannel;
  at: string;
  // The furthest the message got: tapped beats read beats delivered beats sent.
  result: (typeof customerCampaignResults)[number];
};

export type CustomerNoteResponse = {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
};

export type MarketingPreferenceResponse = {
  channel: 'whatsapp' | 'sms' | 'email';
  status: ConsentStatus;
  // Null until the customer answered, or staff recorded an answer, on this channel.
  source: ConsentSource | null;
  changedAt: string | null;
  // Email shows its state but cannot be switched yet.
  canSwitch: boolean;
};
