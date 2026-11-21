import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  khataFailureCodes,
  khataImportStatuses,
  khataMatchKinds,
  khataPageStatuses,
  khataRowKinds,
  khataRowOutcomes,
} from '@dakly/contracts/khata-scans';

import { users } from './auth';
import { createdAt, id, isOneOf, poisha, timestamptz, updatedAt } from './columns';
import { contacts } from './contacts';
import { dueEntries } from './due-book';
import { orders } from './orders';
import { files } from './platform';
import { stores } from './stores';

// One photographed khata page. The photo is kept 30 days through the file's expiry; the rows stay.
export const khataPages = pgTable(
  'khata_pages',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    // Cleared when the 30-day photo purge deletes the photo.
    fileId: uuid('file_id'),
    status: text('status', { enum: khataPageStatuses }).notNull().default('uploaded'),
    failureCode: text('failure_code', { enum: khataFailureCodes }),
    // The reading job's lease, so a redelivered job never reads the same page twice at once.
    claimedAt: timestamptz('claimed_at'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('khata_pages_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'khata_pages_file_id_store_fk',
      columns: [table.storeId, table.fileId],
      foreignColumns: [files.storeId, files.id] as [AnyPgColumn, AnyPgColumn],
    }),
    index('khata_pages_store_id_created_at_idx').on(table.storeId, table.createdAt, table.id),
    index('khata_pages_file_id_idx').on(table.fileId),
    index('khata_pages_created_by_user_id_idx').on(table.createdByUserId),
    check('khata_pages_status', isOneOf(table.status, khataPageStatuses)),
    check('khata_pages_failure_code', isOneOf(table.failureCode, khataFailureCodes)),
    check(
      'khata_pages_failure',
      sql`(${table.status} = 'failed') = (${table.failureCode} is not null)`,
    ),
  ],
);

// What the owner imported from one read page. Undo within 7 days removes what it created.
export const khataImports = pgTable(
  'khata_imports',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    pageId: uuid('page_id').notNull(),
    status: text('status', { enum: khataImportStatuses }).notNull().default('done'),
    rowsRead: integer('rows_read').notNull(),
    rowsImported: integer('rows_imported').notNull(),
    rowsSkipped: integer('rows_skipped').notNull(),
    customersCreated: integer('customers_created').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    undoneAt: timestamptz('undone_at'),
  },
  (table) => [
    uniqueIndex('khata_imports_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'khata_imports_page_id_store_fk',
      columns: [table.storeId, table.pageId],
      foreignColumns: [khataPages.storeId, khataPages.id] as [AnyPgColumn, AnyPgColumn],
    }),
    // A page is imported once; after an undo it can be imported again.
    uniqueIndex('khata_imports_page_id_done_key')
      .on(table.storeId, table.pageId)
      .where(sql`${table.status} = 'done'`),
    index('khata_imports_store_id_created_at_idx').on(table.storeId, table.createdAt, table.id),
    index('khata_imports_created_by_user_id_idx').on(table.createdByUserId),
    check('khata_imports_status', isOneOf(table.status, khataImportStatuses)),
    check(
      'khata_imports_undone',
      sql`(${table.status} = 'undone') = (${table.undoneAt} is not null)`,
    ),
  ],
);

// A row as read from the page. Matches are suggestions the owner confirms; nothing merges itself.
export const khataRows = pgTable(
  'khata_rows',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    pageId: uuid('page_id').notNull(),
    rowNumber: integer('row_number').notNull(),
    entryDate: date('entry_date', { mode: 'string' }),
    name: text('name').notNull(),
    phone: text('phone'),
    item: text('item'),
    amountPoisha: poisha('amount_poisha').notNull(),
    kind: text('kind', { enum: khataRowKinds }).notNull(),
    confidence: smallint('confidence').notNull(),
    matchedContactId: uuid('matched_contact_id'),
    matchKind: text('match_kind', { enum: khataMatchKinds }),
    // Set when the row is imported or skipped. What the import made is kept for its undo.
    importId: uuid('import_id'),
    outcome: text('outcome', { enum: khataRowOutcomes }),
    contactId: uuid('contact_id'),
    isContactCreated: boolean('is_contact_created').notNull().default(false),
    dueEntryId: uuid('due_entry_id'),
    orderId: uuid('order_id'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('khata_rows_page_id_row_number_key').on(table.pageId, table.rowNumber),
    foreignKey({
      name: 'khata_rows_page_id_store_fk',
      columns: [table.storeId, table.pageId],
      foreignColumns: [khataPages.storeId, khataPages.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    foreignKey({
      name: 'khata_rows_matched_contact_id_store_fk',
      columns: [table.storeId, table.matchedContactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'khata_rows_import_id_store_fk',
      columns: [table.storeId, table.importId],
      foreignColumns: [khataImports.storeId, khataImports.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'khata_rows_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'khata_rows_due_entry_id_store_fk',
      columns: [table.storeId, table.dueEntryId],
      foreignColumns: [dueEntries.storeId, dueEntries.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'khata_rows_order_id_store_fk',
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id] as [AnyPgColumn, AnyPgColumn],
    }),
    index('khata_rows_order_id_idx').on(table.orderId),
    index('khata_rows_import_id_idx').on(table.storeId, table.importId),
    index('khata_rows_contact_id_idx').on(table.contactId),
    index('khata_rows_due_entry_id_idx').on(table.dueEntryId),
    index('khata_rows_store_id_page_id_idx').on(table.storeId, table.pageId),
    index('khata_rows_matched_contact_id_idx').on(table.matchedContactId),
    check('khata_rows_kind', isOneOf(table.kind, khataRowKinds)),
    check('khata_rows_match_kind', isOneOf(table.matchKind, khataMatchKinds)),
    check('khata_rows_outcome', isOneOf(table.outcome, khataRowOutcomes)),
    check('khata_rows_confidence', sql`${table.confidence} between 0 and 100`),
    check('khata_rows_amount', sql`${table.amountPoisha} > 0`),
    check(
      'khata_rows_match',
      sql`(${table.matchedContactId} is null) = (${table.matchKind} is null)`,
    ),
  ],
);
