import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { taskSources, taskStatuses } from '@dakly/contracts/platform';
import { users } from './auth';
import { conversations } from './chats';
import { createdAt, id, isOneOf, timestamptz, updatedAt } from './columns';
import { contacts } from './contacts';
import { orders } from './orders';
import { stores } from './stores';

// Follow-ups and reminders for staff ("call back Friday"), from a person, an automation's
// "task for staff" step, or the AI. Due tasks show in notifications (CUS-R7).
export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    title: text('title').notNull(),
    source: text('source', { enum: taskSources }).notNull().default('manual'),
    status: text('status', { enum: taskStatuses }).notNull().default('open'),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id),
    orderId: uuid('order_id').references(() => orders.id),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    dueAt: timestamptz('due_at'),
    doneAt: timestamptz('done_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('tasks_store_id_status_due_idx').on(table.storeId, table.status, table.dueAt),
    index('tasks_store_id_assignee_idx').on(table.storeId, table.assigneeUserId, table.status),
    index('tasks_contact_id_idx').on(table.contactId),
    index('tasks_conversation_id_idx').on(table.conversationId),
    index('tasks_order_id_idx').on(table.orderId),
    index('tasks_assignee_user_id_idx').on(table.assigneeUserId),
    index('tasks_created_by_user_id_idx').on(table.createdByUserId),
    check('tasks_source', isOneOf(table.source, taskSources)),
    check('tasks_status', isOneOf(table.status, taskStatuses)),
  ],
);
