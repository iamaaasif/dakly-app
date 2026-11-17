import {
  foreignKey,
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { importDuplicateModes, importKinds, importStatuses } from '@dakly/contracts/contacts';

import { users } from './auth';
import { createdAt, id, isOneOf, timestamptz, updatedAt } from './columns';
import { files } from './platform';
import { stores } from './stores';

// A CSV import of customers, POS sales (D6), or products, with mapping, counts and an error report.
export const imports = pgTable(
  'imports',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    kind: text('kind', { enum: importKinds }).notNull(),
    status: text('status', { enum: importStatuses }).notNull().default('uploaded'),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    columnMapping: jsonb('column_mapping'),
    duplicateMode: text('duplicate_mode', { enum: importDuplicateModes })
      .notNull()
      .default('update'),
    // CUS-R4: consents are set to granted only when the owner confirmed they agreed.
    hasConsentConfirmation: boolean('has_consent_confirmation').notNull().default(false),
    consentEvidence: jsonb('consent_evidence'),
    rowsTotal: integer('rows_total'),
    rowsAdded: integer('rows_added'),
    rowsUpdated: integer('rows_updated'),
    rowsSkipped: integer('rows_skipped'),
    rowsFailed: integer('rows_failed'),
    reportFileId: uuid('report_file_id').references(() => files.id),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    startedAt: timestamptz('started_at'),
    finishedAt: timestamptz('finished_at'),
    // The running job's lease, renewed after each batch, so a redelivered job never runs beside it.
    claimedAt: timestamptz('claimed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('imports_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'imports_file_id_store_fk',
      columns: [table.storeId, table.fileId],
      foreignColumns: [files.storeId, files.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'imports_report_file_id_store_fk',
      columns: [table.storeId, table.reportFileId],
      foreignColumns: [files.storeId, files.id] as [AnyPgColumn, AnyPgColumn],
    }),

    index('imports_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('imports_file_id_idx').on(table.fileId),
    index('imports_report_file_id_idx').on(table.reportFileId),
    index('imports_created_by_user_id_idx').on(table.createdByUserId),
    check('imports_kind', isOneOf(table.kind, importKinds)),
    check('imports_status', isOneOf(table.status, importStatuses)),
    check('imports_duplicate_mode', isOneOf(table.duplicateMode, importDuplicateModes)),
  ],
);
