import { sql } from 'drizzle-orm';
import {
  foreignKey,
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { createdAt, timestamptz, updatedAt } from './columns';
import { contacts } from './contacts';
import { stores } from './stores';

// Customer preferences from their messages and own orders; staff can edit or clear them.
// Read as context only: current prices and stock always come from tools (CHAT-R11).
export const contactMemories = pgTable(
  'contact_memories',
  {
    contactId: uuid('contact_id')
      .primaryKey()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    summary: text('summary').notNull().default(''),
    // [{ kind, value, source, sourceId, at }] validated by the contracts schema. A staff fact is
    // never overwritten by the model.
    facts: jsonb('facts').notNull().default([]),
    builtAt: timestamptz('built_at'),
    // Clearing memory prevents older messages or orders from repopulating it during rebuild.
    clearedAt: timestamptz('cleared_at'),
    editedByUserId: uuid('edited_by_user_id').references(() => users.id),
    editedAt: timestamptz('edited_at'),
    version: integer('version').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: 'contact_memories_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),

    index('contact_memories_store_id_idx').on(table.storeId),
    index('contact_memories_edited_by_user_id_idx').on(table.editedByUserId),
    check('contact_memories_summary_length', sql`char_length(${table.summary}) <= 600`),
    check('contact_memories_facts_array', sql`jsonb_typeof(${table.facts}) = 'array'`),
    check('contact_memories_facts_count', sql`jsonb_array_length(${table.facts}) <= 40`),
  ],
);
