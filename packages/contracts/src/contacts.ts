import { z } from 'zod';

import type { chatChannels } from './channels';
import { bdMobileSchema } from './phone';

export const contactSources = [
  'messenger',
  'instagram',
  'whatsapp',
  'comment',
  'order_link',
  'manual',
  'voice',
  'import',
  'shopify',
  'woocommerce',
  'pos',
] as const;
export const contactKinds = ['chat_only', 'lead', 'customer', 'not_customer'] as const;
export const notCustomerReasons = [
  'supplier',
  'courier',
  'friend_or_family',
  'job_seeker',
  'spam',
  'other',
] as const;
export const genders = ['female', 'male', 'other'] as const;
export const consentChannels = ['whatsapp', 'sms', 'messenger', 'instagram', 'email'] as const;
export const consentStatuses = ['granted', 'withdrawn'] as const;
export const consentSources = [
  'checkout',
  'chat_opt_in',
  'manual',
  'import',
  'pos',
  'store_sync',
  'opt_out_link',
  'stop_keyword',
  'page_blocked',
] as const;
// Exclusive stages from the glossary, checked top to bottom.
export const lifecycleStages = [
  'none',
  'stopped_buying',
  'best',
  'slipping_away',
  'new',
  'regulars',
  'bought_once',
] as const;
export const returnRiskLevels = ['new_customer', 'good', 'some_returns', 'high'] as const;
export const importKinds = ['customers_csv', 'pos_csv', 'products_csv'] as const;
export const importStatuses = [
  'uploaded',
  'mapped',
  'validated',
  'importing',
  'done',
  'failed',
] as const;
export const importDuplicateModes = ['update', 'skip'] as const;
// Why staff are asked whether two contacts are one person. Only a staff merge acts on it (D27).
export const matchSuggestionReasons = [
  'same_phone',
  'same_email',
  'similar_name_and_area',
] as const;
export const matchSuggestionStatuses = ['open', 'merged', 'dismissed'] as const;
// Customer memory (CHAT-R11). Only what the customer said, what their own orders show, or what staff
// typed; never another person's delivery details (D26).
export const memoryFactKinds = [
  'size',
  'colour',
  'style',
  'budget',
  'product_interest',
  'language',
  'tone',
  'past_issue',
  'delivery_area',
  'other',
] as const;
export const memoryFactSources = ['customer', 'order', 'staff'] as const;
export const customerInsightKinds = [
  'first_product_regulars',
  'due_to_reorder',
  'best_time',
  'loyalty_steps',
  'places',
] as const;
export const customerInsightSources = ['all', 'shopify', 'facebook', 'store'] as const;

const contactName = z.string().trim().min(1).max(120);

export const createContactSchema = z.object({
  name: contactName,
  phone: bdMobileSchema,
});

export const updateContactSchema = z
  .strictObject({
    name: contactName.optional(),
    phone: bdMobileSchema.optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  })
  .refine((change) => Object.keys(change).length > 0, 'Change at least one field');

export const contactListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  kind: z.enum(contactKinds).optional(),
  tag: z.string().trim().min(1).max(50).optional(),
  // A name, a full phone number, or the start of a number for members who see full phones.
  search: z.string().trim().min(1).max(120).optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;
export type ContactKind = (typeof contactKinds)[number];
export type ContactSource = (typeof contactSources)[number];

export type ContactResponse = {
  id: string;
  name: string | null;
  phone: string | null;
  kind: ContactKind;
  tags: string[];
  createdAt: string;
};

export type ContactIdentityResponse = {
  id: string;
  channel: (typeof chatChannels)[number];
  channelConnectionId: string;
  profileName: string | null;
};

export type ContactDetailResponse = ContactResponse & { identities: ContactIdentityResponse[] };
export type ContactListResponse = { items: ContactResponse[]; nextCursor: string | null };

export type ConsentChannel = (typeof consentChannels)[number];
export type ConsentStatus = (typeof consentStatuses)[number];
export type ConsentSource = (typeof consentSources)[number];

// Staff record consent by hand with a note saying how the customer agreed or refused. Email consent
// is not offered until email campaigns ship (D20).
export const recordConsentSchema = z.object({
  channel: z.enum(consentChannels).exclude(['email']),
  status: z.enum(consentStatuses),
  note: z.string().trim().min(1).max(500),
});

export type RecordConsentInput = z.infer<typeof recordConsentSchema>;

export type ConsentResponse = {
  id: string;
  contactId: string;
  channel: ConsentChannel;
  status: ConsentStatus;
  source: ConsentSource;
  capturedAt: string;
};
