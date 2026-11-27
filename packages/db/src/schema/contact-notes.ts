import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth';
import { createdAt, id } from './columns';
import { contacts } from './contacts';
import { stores } from './stores';

// What staff write about a customer on the profile. Kept apart from the AI's memory facts: a note
// has an author and a date and is never rewritten by the model.
export const contactNotes = pgTable(
  'contact_notes',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    contactId: uuid('contact_id').notNull(),
    body: text('body').notNull(),
    authorUserId: uuid('author_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: 'contact_notes_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    index('contact_notes_contact_created_idx').on(table.storeId, table.contactId, table.createdAt),
    index('contact_notes_author_user_id_idx').on(table.authorUserId),
    check('contact_notes_body_length', sql`char_length(${table.body}) between 1 and 2000`),
  ],
);
