import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  integer,
  foreignKey,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  dueEntryKinds,
  dueMessageKinds,
  dueMessageSkipReasons,
  dueMessageStatuses,
  dueEntrySources,
  duePaymentMethods,
  MAX_DUE_AMOUNT_POISHA,
} from '@dakly/contracts/due-book';

import { users } from './auth';
import { createdAt, id, isOneOf, poisha, timestamptz } from './columns';
import { contacts } from './contacts';
import { stores } from './stores';

// The Due book ledger: a baki, a payment or a write-off is a new row and is never edited. The
// balance and the oldest debt come from these rows, settled oldest baki first (SHOP-R5).
export const dueEntries = pgTable(
  'due_entries',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    contactId: uuid('contact_id').notNull(),
    kind: text('kind', { enum: dueEntryKinds }).notNull(),
    amountPoisha: poisha('amount_poisha').notNull(),
    // When the baki or payment happened. A khata import dates it from the page.
    occurredAt: timestamptz('occurred_at').notNull(),
    method: text('method', { enum: duePaymentMethods }),
    // The reason for a write-off.
    note: text('note'),
    source: text('source', { enum: dueEntrySources }).notNull().default('manual'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('due_entries_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'due_entries_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    index('due_entries_contact_idx').on(table.storeId, table.contactId, table.occurredAt, table.id),
    index('due_entries_kind_idx').on(table.storeId, table.kind, table.occurredAt),
    index('due_entries_recorded_by_user_id_idx').on(table.recordedByUserId),
    check('due_entries_kind', isOneOf(table.kind, dueEntryKinds)),
    check('due_entries_method', isOneOf(table.method, duePaymentMethods)),
    check('due_entries_source', isOneOf(table.source, dueEntrySources)),
    check(
      'due_entries_amount_poisha',
      sql`${table.amountPoisha} > 0 and ${table.amountPoisha} <= ${sql.raw(String(MAX_DUE_AMOUNT_POISHA))}`,
    ),
    // Only a payment has a method, and a write-off always says why.
    check(
      'due_entries_method_for_payment',
      sql`(${table.kind} = 'payment') = (${table.method} is not null)`,
    ),
    check(
      'due_entries_note',
      sql`char_length(${table.note}) <= 500 and (${table.kind} <> 'write_off' or ${table.note} is not null)`,
    ),
  ],
);

// A baki notice or reminder SMS. The row is the record that it was asked for, so a retried job
// never sends twice, and the reminder rows are what the 7-day limit counts.
export const dueMessages = pgTable(
  'due_messages',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    contactId: uuid('contact_id').notNull(),
    kind: text('kind', { enum: dueMessageKinds }).notNull(),
    // The baki a notice is about; a reminder has none.
    entryId: uuid('entry_id'),
    body: text('body').notNull(),
    status: text('status', { enum: dueMessageStatuses }).notNull().default('queued'),
    skipReason: text('skip_reason', { enum: dueMessageSkipReasons }),
    credits: integer('credits'),
    providerMessageId: text('provider_message_id'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    sentAt: timestamptz('sent_at'),
  },
  (table) => [
    foreignKey({
      name: 'due_messages_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    foreignKey({
      name: 'due_messages_entry_id_store_fk',
      columns: [table.storeId, table.entryId],
      foreignColumns: [dueEntries.storeId, dueEntries.id] as [AnyPgColumn, AnyPgColumn],
    }),
    // One notice per baki.
    uniqueIndex('due_messages_entry_key')
      .on(table.storeId, table.entryId)
      .where(sql`${table.entryId} is not null`),
    index('due_messages_contact_idx').on(
      table.storeId,
      table.contactId,
      table.kind,
      table.createdAt,
    ),
    index('due_messages_requested_by_user_id_idx').on(table.requestedByUserId),
    check('due_messages_kind', isOneOf(table.kind, dueMessageKinds)),
    check('due_messages_status', isOneOf(table.status, dueMessageStatuses)),
    check('due_messages_skip_reason', isOneOf(table.skipReason, dueMessageSkipReasons)),
    check(
      'due_messages_skipped_has_reason',
      sql`(${table.status} = 'skipped') = (${table.skipReason} is not null)`,
    ),
    check(
      'due_messages_entry_for_notice',
      sql`(${table.kind} = 'baki_notice') = (${table.entryId} is not null)`,
    ),
  ],
);
