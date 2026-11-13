import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  boolean,
} from 'drizzle-orm/pg-core';
import { chatChannels } from '@dakly/contracts/channels';
import {
  aiRatings,
  commentClassifications,
  commentStatuses,
  conversationResponders,
  conversationStatuses,
  handoverReasons,
  leadTemperatures,
  messageAuthorTypes,
  messageDirections,
  messageKinds,
  messageSourceTypes,
  messageStatuses,
} from '@dakly/contracts/chats';
import { aiRuns } from './ai';
import { users } from './auth';
import { channelConnections } from './channels';
import { createdAt, id, isOneOf, timestamptz, updatedAt } from './columns';
import { contacts } from './contacts';
import { postTargets } from './social';
import { stores } from './stores';

// One chat per contact per connected account. Three independent state fields (status, responder,
// assignee). version is bumped on every staff action, so an AI reply written after a slow model
// call is saved only if nothing changed meanwhile (no lock is held during the call).
export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id),
    channelConnectionId: uuid('channel_connection_id')
      .notNull()
      .references(() => channelConnections.id),
    channel: text('channel', { enum: chatChannels }).notNull(),
    status: text('status', { enum: conversationStatuses }).notNull().default('open'),
    responder: text('responder', { enum: conversationResponders }).notNull().default('ai'),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id),
    handoverReason: text('handover_reason', { enum: handoverReasons }),
    handedOverAt: timestamptz('handed_over_at'),
    responderReturnsAt: timestamptz('responder_returns_at'),
    intentTag: text('intent_tag'),
    leadTemperature: text('lead_temperature', { enum: leadTemperatures }),
    // Q7: Inquiry is a chat flag, not an order stage, until Asif decides.
    hasBuyingInterest: boolean('has_buying_interest').notNull().default(false),
    lastInboundAt: timestamptz('last_inbound_at'),
    lastOutboundAt: timestamptz('last_outbound_at'),
    lastMessageAt: timestamptz('last_message_at'),
    lastMessagePreview: text('last_message_preview'),
    windowExpiresAt: timestamptz('window_expires_at'),
    unreadCount: integer('unread_count').notNull().default(0),
    aiSummary: text('ai_summary'),
    version: integer('version').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('conversations_connection_contact_key').on(
      table.channelConnectionId,
      table.contactId,
    ),
    index('conversations_store_id_status_idx').on(table.storeId, table.status, table.lastMessageAt),
    index('conversations_store_id_assignee_idx').on(
      table.storeId,
      table.assigneeUserId,
      table.status,
    ),
    index('conversations_store_id_window_idx').on(
      table.storeId,
      table.channel,
      table.lastInboundAt,
    ),
    index('conversations_contact_id_idx').on(table.contactId),
    index('conversations_assignee_user_id_idx').on(table.assigneeUserId),
    index('conversations_responder_returns_at_idx')
      .on(table.responderReturnsAt)
      .where(sql`${table.responderReturnsAt} is not null`),
    check('conversations_channel', isOneOf(table.channel, chatChannels)),
    check('conversations_status', isOneOf(table.status, conversationStatuses)),
    check('conversations_responder', isOneOf(table.responder, conversationResponders)),
    check('conversations_handover_reason', isOneOf(table.handoverReason, handoverReasons)),
    check('conversations_lead_temperature', isOneOf(table.leadTemperature, leadTemperatures)),
  ],
);

// Every message in and out of a chat, including internal notes and WhatsApp template sends from
// campaigns and automations (so staff see what the customer is replying to). The biggest table:
// partition by created_at when it passes the trigger in docs/data/indexes-and-scale.md.
export const messages = pgTable(
  'messages',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    direction: text('direction', { enum: messageDirections }).notNull(),
    authorType: text('author_type', { enum: messageAuthorTypes }).notNull(),
    authorUserId: uuid('author_user_id').references(() => users.id),
    kind: text('kind', { enum: messageKinds }).notNull(),
    body: text('body'),
    // Object keys in R2 plus type and size for each attachment.
    attachments: jsonb('attachments'),
    // Voice transcript or image description, so staff and the AI read the same text.
    transcript: text('transcript'),
    externalId: text('external_id'),
    idempotencyKey: text('idempotency_key'),
    status: text('status', { enum: messageStatuses }).notNull(),
    errorCode: text('error_code'),
    sourceType: text('source_type', { enum: messageSourceTypes }).notNull().default('chat'),
    sourceId: uuid('source_id'),
    aiRunId: uuid('ai_run_id').references(() => aiRuns.id),
    // CHAT-R8: the knowledge items, products and rules this AI reply used.
    aiSources: jsonb('ai_sources'),
    aiRating: text('ai_rating', { enum: aiRatings }),
    aiRatingReason: text('ai_rating_reason'),
    ratedByUserId: uuid('rated_by_user_id').references(() => users.id),
    ratedAt: timestamptz('rated_at'),
    sentAt: timestamptz('sent_at'),
    deliveredAt: timestamptz('delivered_at'),
    readAt: timestamptz('read_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('messages_conversation_external_id_key')
      .on(table.conversationId, table.externalId)
      .where(sql`${table.externalId} is not null`),
    uniqueIndex('messages_store_id_idempotency_key_key')
      .on(table.storeId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index('messages_conversation_id_created_at_idx').on(table.conversationId, table.createdAt),
    index('messages_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('messages_store_id_external_id_idx')
      .on(table.storeId, table.externalId)
      .where(sql`${table.direction} = 'out' and ${table.externalId} is not null`),
    index('messages_store_id_rated_idx')
      .on(table.storeId, table.ratedAt)
      .where(sql`${table.aiRating} is not null`),
    index('messages_author_user_id_idx').on(table.authorUserId),
    index('messages_ai_run_id_idx').on(table.aiRunId),
    index('messages_rated_by_user_id_idx').on(table.ratedByUserId),
    check('messages_direction', isOneOf(table.direction, messageDirections)),
    check('messages_author_type', isOneOf(table.authorType, messageAuthorTypes)),
    check('messages_kind', isOneOf(table.kind, messageKinds)),
    check('messages_status', isOneOf(table.status, messageStatuses)),
    check('messages_source_type', isOneOf(table.sourceType, messageSourceTypes)),
    check('messages_ai_rating', isOneOf(table.aiRating, aiRatings)),
    check(
      'messages_user_author',
      sql`(${table.authorType} = 'user') = (${table.authorUserId} is not null)`,
    ),
  ],
);

// Comments on the store's Facebook and Instagram posts. Meta allows one private reply per comment.
export const socialComments = pgTable(
  'social_comments',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    channelConnectionId: uuid('channel_connection_id')
      .notNull()
      .references(() => channelConnections.id),
    postTargetId: uuid('post_target_id').references(() => postTargets.id),
    externalPostId: text('external_post_id').notNull(),
    externalCommentId: text('external_comment_id').notNull(),
    parentExternalCommentId: text('parent_external_comment_id'),
    contactId: uuid('contact_id').references(() => contacts.id),
    authorName: text('author_name'),
    body: text('body'),
    classification: text('classification', { enum: commentClassifications }),
    status: text('status', { enum: commentStatuses }).notNull().default('new'),
    publicReplyExternalId: text('public_reply_external_id'),
    privateRepliedAt: timestamptz('private_replied_at'),
    conversationId: uuid('conversation_id').references(() => conversations.id),
    commentedAt: timestamptz('commented_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('social_comments_connection_comment_key').on(
      table.channelConnectionId,
      table.externalCommentId,
    ),
    index('social_comments_store_id_post_idx').on(
      table.storeId,
      table.externalPostId,
      table.commentedAt,
    ),
    index('social_comments_store_id_status_idx').on(table.storeId, table.status),
    index('social_comments_post_target_id_idx').on(table.postTargetId),
    index('social_comments_contact_id_idx').on(table.contactId),
    index('social_comments_conversation_id_idx').on(table.conversationId),
    check('social_comments_classification', isOneOf(table.classification, commentClassifications)),
    check('social_comments_status', isOneOf(table.status, commentStatuses)),
  ],
);

// Staff shortcuts. The AI reads them as knowledge; there is no auto-answer engine in release 1.
export const savedReplies = pgTable(
  'saved_replies',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    shortcut: text('shortcut'),
    useCount: integer('use_count').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('saved_replies_store_id_shortcut_key')
      .on(table.storeId, table.shortcut)
      .where(sql`${table.shortcut} is not null`),
    index('saved_replies_store_id_idx').on(table.storeId),
    index('saved_replies_created_by_user_id_idx').on(table.createdByUserId),
  ],
);
