import { sql, type AnyColumn } from 'drizzle-orm';

import type { messageAuthorTypes } from '@dakly/contracts/chats';
import type { ContactKind } from '@dakly/contracts/contacts';
import { conversations, messages } from '@dakly/db/schema/chats';
import { contacts } from '@dakly/db/schema/contacts';

type MessageAuthorType = (typeof messageAuthorTypes)[number];

function ofContact<T>(column: AnyColumn) {
  return sql<T>`(select ${column} from ${contacts} where ${contacts.storeId} = ${conversations.storeId} and ${contacts.id} = ${conversations.contactId})`;
}

// What every conversation read returns: the list, one chat, and the rows an update returns.
export const conversationFields = {
  id: conversations.id,
  channel: conversations.channel,
  contactId: conversations.contactId,
  contactName: ofContact<string | null>(contacts.name),
  // The shop's labels on a chat are the contact's tags.
  labels: ofContact<string[]>(contacts.tags),
  contactKind: ofContact<ContactKind>(contacts.kind),
  status: conversations.status,
  responder: conversations.responder,
  assigneeUserId: conversations.assigneeUserId,
  handoverReason: conversations.handoverReason,
  handoverSummary: conversations.handoverSummary,
  handedOverAt: conversations.handedOverAt,
  aiResumesAt: conversations.aiResumesAt,
  // Keep PostgreSQL's microseconds in cursor timestamps.
  lastMessageAt: sql<
    string | null
  >`to_char(${conversations.lastMessageAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  lastMessagePreview: conversations.lastMessagePreview,
  // Notes, system lines and unsent replies are not part of the talk the row describes.
  lastMessageFrom: sql<MessageAuthorType | null>`(select ${messages.authorType} from ${messages}
    where ${messages.storeId} = ${conversations.storeId} and ${messages.conversationId} = ${conversations.id}
      and ${messages.kind} not in ('note', 'system')
      and (${messages.direction} = 'in' or ${messages.status} in ('sent', 'delivered', 'read'))
    order by ${messages.createdAt} desc limit 1)`,
  intentTag: conversations.intentTag,
  suggestedReply: conversations.suggestedReply,
  windowExpiresAt: conversations.windowExpiresAt,
  unreadCount: conversations.unreadCount,
};
