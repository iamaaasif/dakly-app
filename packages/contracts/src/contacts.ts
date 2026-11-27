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
  'khata_import',
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
export const consentStatuses = ['granted', 'withdrawn', 'not_answered'] as const;
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
// The customer list tabs. Each one maps to lifecycle stages, except high value, which is the top 10%
// of customers by net spend whatever their stage.
export const contactListTypes = [
  'new',
  'returning',
  'vip',
  'inactive',
  'high_value',
  'at_risk',
] as const;
export const contactListSorts = [
  'newest',
  'last_purchase',
  'highest_spend',
  'most_orders',
  'name',
] as const;
export const lastPurchaseWindows = [
  '7_days',
  '30_days',
  '90_days',
  'over_90_days',
  'never',
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
  'undone',
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

export const MAX_CONTACT_TAGS = 50;
const contactTags = z.array(z.string().trim().min(1).max(50)).max(MAX_CONTACT_TAGS);

// Everything past name and phone is what the Add contact form can fill in. `age` is stored as a
// birth year, and `notes` becomes the first note on the profile.
export const createContactSchema = z.object({
  name: contactName,
  phone: bdMobileSchema,
  whatsappPhone: bdMobileSchema.optional(),
  email: z.email().max(254).optional(),
  gender: z.enum(genders).optional(),
  age: z.int().min(1).max(120).optional(),
  address: z.string().trim().min(1).max(500).optional(),
  district: z.string().trim().min(1).max(100).optional(),
  tags: contactTags.optional(),
  notes: z.string().trim().min(1).max(2000).optional(),
});

export const updateContactSchema = z
  .strictObject({
    name: contactName.optional(),
    phone: bdMobileSchema.optional(),
    tags: contactTags.optional(),
  })
  .refine((change) => Object.keys(change).length > 0, 'Change at least one field');

export const contactListQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  kind: z.enum(contactKinds).optional(),
  tag: z.string().trim().min(1).max(50).optional(),
  // A name, an email, an area, a full phone number, or the start of a number for members who see full phones.
  search: z.string().trim().min(1).max(120).optional(),
  type: z.enum(contactListTypes).optional(),
  source: z.enum(contactSources).optional(),
  minSpendPoisha: z.coerce.number().int().min(0).optional(),
  maxSpendPoisha: z.coerce.number().int().min(0).optional(),
  lastPurchase: z.enum(lastPurchaseWindows).optional(),
  sort: z.enum(contactListSorts).default('newest'),
});

// The export takes the list's filters and everything they match, so it has no cursor, limit or sort.
export const contactExportQuerySchema = contactListQuerySchema.omit({
  cursor: true,
  limit: true,
  sort: true,
});

export const matchSuggestionListQuerySchema = z.strictObject({ contactId: z.uuid() });

// The client makes the key once per merge attempt and sends it again on a retry (D29).
export const mergeContactsSchema = z.strictObject({
  contactId: z.uuid(),
  otherContactId: z.uuid(),
  operationKey: z.uuid(),
});
export type MergeContactsInput = z.infer<typeof mergeContactsSchema>;

export const contactMergeListQuerySchema = z.strictObject({ contactId: z.uuid() });

// The older contact is kept, so the screen opens that profile after a merge.
export type ContactMergeResponse = {
  id: string;
  keptContactId: string;
  mergedContactId: string;
  mergedContactName: string | null;
  mergedAt: string;
  undoUntil: string;
  undoneAt: string | null;
  undoConflicts: string[];
};

// A file column the mapping can name; the reader keeps no cells past this.
export const MAX_IMPORT_COLUMNS = 200;
const importColumn = z
  .int()
  .min(0)
  .max(MAX_IMPORT_COLUMNS - 1);

// The file column for each field, by position, so two columns with the same header stay apart.
// The phone finds an existing contact, so an import never replaces it.
export const contactImportMappingSchema = z
  .strictObject({
    phone: importColumn,
    name: importColumn.optional(),
    whatsappPhone: importColumn.optional(),
    email: importColumn.optional(),
    address: importColumn.optional(),
    district: importColumn.optional(),
    tags: importColumn.optional(),
    notes: importColumn.optional(),
  })
  .refine(
    (mapping) => new Set(Object.values(mapping)).size === Object.keys(mapping).length,
    'Map each column to one field at most',
  );

function optionalCell<T extends z.ZodType<unknown, string>>(schema: T) {
  return z
    .string()
    .trim()
    .optional()
    .transform((cell) => cell || undefined)
    .pipe(schema.optional());
}

// One file row after mapping, every cell as text. Blank or unmapped cells leave the field unset.
export const contactImportRowSchema = z.object({
  phone: z.string().trim().min(1, 'Add a phone number').pipe(bdMobileSchema),
  name: optionalCell(contactName),
  whatsappPhone: optionalCell(bdMobileSchema),
  email: optionalCell(z.email().max(254)),
  address: optionalCell(z.string().max(500)),
  district: optionalCell(z.string().max(100)),
  tags: optionalCell(
    z
      .string()
      .transform((cell) => cell.split(',').filter((tag) => tag.trim()))
      .pipe(contactTags),
  ),
  notes: optionalCell(z.string().max(2000)),
});

// Feature 03: a customer file is at most 10 MB and 50,000 rows.
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 50_000;

export const createImportSchema = z.strictObject({
  sizeBytes: z.int().min(1).max(MAX_IMPORT_FILE_BYTES),
});

// CUS-R4 and D42: the shop states where consent came from, per channel, for every row in the file.
// A channel it does not name gets no consent.
const consentEvidence = z.string().trim().min(1).max(500);
export const importConsentEvidenceSchema = z.strictObject({
  sms: consentEvidence.optional(),
  whatsapp: consentEvidence.optional(),
});

export const startImportSchema = z.strictObject({
  mapping: contactImportMappingSchema,
  duplicateMode: z.enum(importDuplicateModes),
  consentEvidence: importConsentEvidenceSchema,
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ContactExportQuery = z.infer<typeof contactExportQuerySchema>;
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;
export type ContactImportMapping = z.infer<typeof contactImportMappingSchema>;
export type ContactImportRow = z.infer<typeof contactImportRowSchema>;
export type ContactImportField = keyof ContactImportRow;
export type CreateImportInput = z.infer<typeof createImportSchema>;
export type StartImportInput = z.infer<typeof startImportSchema>;
export type ImportConsentEvidence = z.infer<typeof importConsentEvidenceSchema>;
export type ImportKind = (typeof importKinds)[number];
export type ImportStatus = (typeof importStatuses)[number];
export type ImportDuplicateMode = (typeof importDuplicateModes)[number];
export type LifecycleStage = (typeof lifecycleStages)[number];
export type ContactListType = (typeof contactListTypes)[number];
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

// The list adds the columns its Columns picker can show; the profile and the other routes keep the short shape.
export type ContactListItemResponse = ContactResponse & {
  // Masked like `phone` for members without See full phone numbers.
  whatsappPhone: string | null;
  email: string | null;
  // The Location column.
  district: string | null;
  source: ContactSource;
  // Channels the customer agreed to receive marketing on, in `consentChannels` order.
  consentedChannels: ConsentChannel[];
  // From contact_stats; a contact with no orders has zero and a null date.
  ordersCount: number;
  netSpendPoisha: number;
  lastOrderAt: string | null;
  lifecycleStage: LifecycleStage;
  // In the top 10% of customers by net spend, which the Type column shows beside the stage.
  isHighValue: boolean;
};

export type ImportUploadResponse = { importId: string; uploadUrl: string };

export type ImportResponse = {
  id: string;
  status: ImportStatus;
  undoFinishedAt: string | null;
  rowsTotal: number | null;
  rowsAdded: number | null;
  rowsUpdated: number | null;
  rowsSkipped: number | null;
  rowsFailed: number | null;
  // A link to the CSV of row errors, valid for 15 minutes; null when nothing went wrong.
  reportUrl: string | null;
};

export type MatchSuggestionReason = (typeof matchSuggestionReasons)[number];

// The other contact in an open suggestion, seen from the profile being viewed. The phone is masked
// unless the member may see full numbers.
export type MatchSuggestionResponse = {
  id: string;
  reason: MatchSuggestionReason;
  otherContact: { id: string; name: string | null; phone: string | null };
  createdAt: string;
};

export type ContactIdentityResponse = {
  id: string;
  channel: (typeof chatChannels)[number];
  channelConnectionId: string;
  profileName: string | null;
};

export type ContactDetailResponse = ContactResponse & { identities: ContactIdentityResponse[] };
// `total` counts everything the filters match, not just this page.
export type ContactListResponse = {
  items: ContactListItemResponse[];
  nextCursor: string | null;
  total: number;
};

// The tab counts and the page subtitle. Only deleted contacts are left out, whatever the filters.
export type ContactCountsResponse = {
  all: number;
  new: number;
  returning: number;
  vip: number;
  inactive: number;
  highValue: number;
  atRisk: number;
  boughtMoreThanOnce: number;
  // Agreed to receive marketing on at least one channel.
  canReceiveMarketing: number;
};

export type ConsentChannel = (typeof consentChannels)[number];
export type ConsentStatus = (typeof consentStatuses)[number];
export type ConsentSource = (typeof consentSources)[number];

// Staff record consent by hand with a note saying how the customer agreed or refused. Email consent
// is not offered until email campaigns ship (D20).
export const recordConsentSchema = z.object({
  channel: z.enum(consentChannels).exclude(['email']),
  status: z.enum(consentStatuses).exclude(['not_answered']),
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
