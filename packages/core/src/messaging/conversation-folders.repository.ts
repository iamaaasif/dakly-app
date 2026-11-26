import { and, eq, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';

import type {
  ConversationCountsResponse,
  conversationFolders,
  conversationStates,
} from '@dakly/contracts/chats';
import { conversations } from '@dakly/db/schema/chats';
import { contacts } from '@dakly/db/schema/contacts';

export const statusOfState = {
  open: inArray(conversations.status, ['open', 'needs_you']),
  snoozed: eq(conversations.status, 'later'),
  resolved: eq(conversations.status, 'done'),
} satisfies Record<(typeof conversationStates)[number], SQL>;

// Not customers and Spam are kept out of every other folder.
export function folderCondition(folder: (typeof conversationFolders)[number], userId: string) {
  const customers = ne(contacts.kind, 'not_customer');
  const rules = {
    all: customers,
    mine: and(customers, eq(conversations.assigneeUserId, userId)),
    unassigned: and(customers, isNull(conversations.assigneeUserId)),
    unreplied: and(
      customers,
      isNotNull(conversations.lastInboundAt),
      or(
        isNull(conversations.lastOutboundAt),
        lt(conversations.lastOutboundAt, conversations.lastInboundAt),
      ),
    ),
    ai_handling: and(customers, eq(conversations.responder, 'ai')),
    // AI-4 writes the intent tag; until it does, this folder stays empty.
    order_request: and(customers, inArray(conversations.intentTag, ['order', 'confirm'])),
    not_customers: and(eq(contacts.kind, 'not_customer'), ne(contacts.notCustomerReason, 'spam')),
    spam: eq(contacts.notCustomerReason, 'spam'),
  };
  return rules[folder];
}

function countWhere(condition: SQL | undefined) {
  return sql<number>`(count(*) filter (where ${condition}))::int`;
}

// The Inbox counts in one row: folders count their open chats, the rest count All conversations.
export function folderCounts(userId: string) {
  const open = (folder: (typeof conversationFolders)[number]) =>
    countWhere(and(statusOfState.open, folderCondition(folder, userId)));
  const all = folderCondition('all', userId);
  return {
    all: open('all'),
    mine: open('mine'),
    unassigned: open('unassigned'),
    unreplied: open('unreplied'),
    ai_handling: open('ai_handling'),
    order_request: open('order_request'),
    not_customers: open('not_customers'),
    spam: open('spam'),
    unread: countWhere(and(statusOfState.open, all, sql`${conversations.unreadCount} > 0`)),
    needsYou: countWhere(and(eq(conversations.status, 'needs_you'), all)),
    snoozed: countWhere(and(statusOfState.snoozed, all)),
    resolved: countWhere(and(statusOfState.resolved, all)),
  } satisfies Record<keyof ConversationCountsResponse, SQL<number>>;
}
