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

export const createContactSchema = z.object({
  name: contactName,
  phone: bdMobileSchema,
});

export const MAX_CONTACT_TAGS = 50;
const contactTags = z.array(z.string().trim().min(1).max(50)).max(MAX_CONTACT_TAGS);

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
  // A name, a full phone number, or the start of a number for members who see full phones.
  search: z.string().trim().min(1).max(120).optional(),
});

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
