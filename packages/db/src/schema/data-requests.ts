import { sql } from 'drizzle-orm';
import {
  foreignKey,
  type AnyPgColumn,
  check,
  index,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { dataRequestKinds, dataRequestStatuses } from '@dakly/contracts/platform';

import { staffUsers } from './admin';
import { users } from './auth';
import { createdAt, id, isOneOf, timestamptz, updatedAt } from './columns';
import { contacts } from './contacts';
import { files } from './platform';
import { stores } from './stores';

// Admin panel data requests: a shop asks to export or delete its store, or passes on a
// customer's "delete my data". Staff handle them; the shop sees its own requests.
export const dataRequests = pgTable(
  'data_requests',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    kind: text('kind', { enum: dataRequestKinds }).notNull(),
    status: text('status', { enum: dataRequestStatuses }).notNull().default('open'),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
    dueAt: timestamptz('due_at').notNull(),
    handledByStaffId: uuid('handled_by_staff_id').references(() => staffUsers.id),
    // The export file; its signed link is valid for 7 days.
    fileId: uuid('file_id').references(() => files.id),
    note: text('note'),
    completedAt: timestamptz('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: 'data_requests_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'data_requests_file_id_store_fk',
      columns: [table.storeId, table.fileId],
      foreignColumns: [files.storeId, files.id] as [AnyPgColumn, AnyPgColumn],
    }),
    index('data_requests_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('data_requests_open_idx')
      .on(table.dueAt)
      .where(sql`${table.status} in ('open', 'in_progress')`),
    index('data_requests_contact_id_idx').on(table.contactId),
    index('data_requests_requested_by_user_id_idx').on(table.requestedByUserId),
    index('data_requests_handled_by_staff_id_idx').on(table.handledByStaffId),
    index('data_requests_file_id_idx').on(table.fileId),
    check('data_requests_kind', isOneOf(table.kind, dataRequestKinds)),
    check('data_requests_status', isOneOf(table.status, dataRequestStatuses)),
  ],
);
