import { z } from 'zod';

export const dueEntryKinds = ['baki', 'payment', 'write_off'] as const;
export const dueEntrySources = ['manual', 'khata_import'] as const;
export const duePaymentMethods = ['cash', 'bkash', 'nagad', 'rocket', 'card', 'bank'] as const;
export const dueListFilters = ['all', 'over_30_days', 'never_reminded'] as const;

export type DueEntryKind = (typeof dueEntryKinds)[number];
export type DueEntrySource = (typeof dueEntrySources)[number];
export type DuePaymentMethod = (typeof duePaymentMethods)[number];
export type DueListFilter = (typeof dueListFilters)[number];

// Feature 13: a debt older than this many days counts as "Older than 30 days".
export const OVERDUE_DAYS = 30;
// Ten crore taka, far above any shop's baki and far below the 2^53 poisha number limit.
export const MAX_DUE_AMOUNT_POISHA = 10_000_000_000;

const amountPoisha = z.int().positive().max(MAX_DUE_AMOUNT_POISHA);
const note = z.string().trim().min(1).max(500).optional();
// Backdating is for baki and payments copied from a paper khata. The service rejects a future time.
const occurredAt = z.iso.datetime().optional();

export const recordBakiSchema = z.strictObject({ amountPoisha, note, occurredAt });
export type RecordBakiInput = z.infer<typeof recordBakiSchema>;

export const collectPaymentSchema = z.strictObject({
  amountPoisha,
  method: z.enum(duePaymentMethods),
  note,
  occurredAt,
});
export type CollectPaymentInput = z.infer<typeof collectPaymentSchema>;

export const writeOffSchema = z.strictObject({
  amountPoisha,
  reason: z.string().trim().min(1).max(200),
});
export type WriteOffInput = z.infer<typeof writeOffSchema>;

// "<ISO time>|<id>" of the last row of the previous page; the service reads it back.
const cursor = z.string().regex(/^\d{4}-\d\d-\d\dT[\d:.]+Z\|[0-9a-f-]{36}$/);

export const dueCustomerListQuerySchema = z.strictObject({
  filter: z.enum(dueListFilters).default('all'),
  cursor: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type DueCustomerListQuery = z.infer<typeof dueCustomerListQuerySchema>;

export const dueHistoryQuerySchema = z.strictObject({
  cursor: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type DueHistoryQuery = z.infer<typeof dueHistoryQuerySchema>;

export type DueEntryResponse = {
  id: string;
  contactId: string;
  kind: DueEntryKind;
  amountPoisha: number;
  occurredAt: string;
  method: DuePaymentMethod | null;
  // For a write-off this is the reason.
  note: string | null;
  source: DueEntrySource;
  recordedByUserId: string | null;
  createdAt: string;
};

// What the customer owes, or the shop owes when negative ("Shop owes ৳200").
export type DueBalanceResponse = {
  contactId: string;
  balancePoisha: number;
  // Date of the oldest baki that payments and write-offs have not settled yet.
  oldestDebtAt: string | null;
};

export type RecordedDueEntryResponse = { entry: DueEntryResponse; balance: DueBalanceResponse };

export type DueHistoryItem = DueEntryResponse & { balanceAfterPoisha: number };
export type DueHistoryResponse = { items: DueHistoryItem[]; nextCursor: string | null };

export type DueCustomerResponse = DueBalanceResponse & {
  name: string | null;
  phone: string | null;
};
export type DueListCustomerResponse = DueCustomerResponse & {
  // The last reminder asked for that was not refused; null when the customer was never reminded.
  lastRemindedAt: string | null;
};
export type DueCustomerListResponse = {
  items: DueListCustomerResponse[];
  nextCursor: string | null;
};

export type DueSummaryResponse = {
  totalOwedPoisha: number;
  customersOwing: number;
  overdueOwedPoisha: number;
  overdueCustomers: number;
  neverRemindedCustomers: number;
  collectedLast7DaysPoisha: number;
};

export const dueMessageKinds = ['baki_notice', 'reminder'] as const;
export const dueMessageStatuses = ['queued', 'sending', 'sent', 'skipped', 'failed'] as const;
// Why a message was not sent. `no_credits` is the shop's SMS balance being too low.
export const dueMessageSkipReasons = [
  'not_owing',
  'outside_hours',
  'no_address',
  'blocked',
  'no_credits',
] as const;

export type DueMessageKind = (typeof dueMessageKinds)[number];
export type DueMessageStatus = (typeof dueMessageStatuses)[number];
export type DueMessageSkipReason = (typeof dueMessageSkipReasons)[number];

// Feature 13 rule 4 (SHOP-R4): a customer gets at most one reminder in this many days, and
// only between these local hours.
export const REMINDER_INTERVAL_DAYS = 7;
export const REMINDER_FIRST_HOUR = 9;
export const REMINDER_LAST_HOUR = 20;

export type RemindResponse = { messageId: string };

// Customers left out of "Remind all over 30 days", by reason, so the dialog can say why.
export type RemindOverdueResponse = {
  queued: number;
  skippedRecentlyReminded: number;
  skippedNoPhone: number;
  skippedBlocked: number;
};
