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
  uniqueIndex,
  uuid,
  boolean,
  smallint,
  type PgTableExtraConfigValue,
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
  messageSendCategories,
  messageSourceTypes,
  messageStatuses,
  smsMessagePurposes,
  smsMessageStatuses,
} from '@dakly/contracts/chats';

import { users } from './auth';
import { channelConnections, smsSenderIds } from './channels';
import { createdAt, id, isOneOf, timestamptz, updatedAt } from './columns';
import { contactIdentities, contacts } from './contacts';
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
    // When the AI takes the chat back after a person's last message (return timer).
    aiResumesAt: timestamptz('ai_resumes_at'),
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
    // Logical cursor survives message retention; this conversation alone owns its progress.
    memoryBuiltThroughMessageId: uuid('memory_built_through_message_id'),
    memoryBuiltThroughMessageAt: timestamptz('memory_built_through_message_at'),
    memoryVersion: integer('memory_version').notNull().default(0),
    version: integer('version').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('conversations_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'conversations_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'conversations_channel_connection_id_store_fk',
      columns: [table.storeId, table.channelConnectionId],
      foreignColumns: [channelConnections.storeId, channelConnections.id] as [
        AnyPgColumn,
        AnyPgColumn,
      ],
    }),

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
    index('conversations_ai_resumes_at_idx')
      .on(table.aiResumesAt)
      .where(sql`${table.aiResumesAt} is not null`),
    check(
      'conversations_memory_checkpoint',
      sql`(${table.memoryBuiltThroughMessageId} is null) = (${table.memoryBuiltThroughMessageAt} is null)`,
    ),
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
    mediaText: text('media_text'),
    externalId: text('external_id'),
    idempotencyKey: text('idempotency_key'),
    senderIdentityId: uuid('sender_identity_id'),
    recipientIdentityId: uuid('recipient_identity_id'),
    sendCategory: text('send_category', { enum: messageSendCategories }),
    status: text('status', { enum: messageStatuses }).notNull(),
    errorCode: text('error_code'),
    sourceType: text('source_type', { enum: messageSourceTypes }).notNull().default('chat'),
    sourceId: uuid('source_id'),
    // Plain reference: ai_runs is partitioned by month and expires (docs/data/growth.md).
    aiRunId: uuid('ai_run_id'),
    // CHAT-R8: the knowledge items, products and rules this AI reply used.
    aiSources: jsonb('ai_sources'),
    aiRating: text('ai_rating', { enum: aiRatings }),
    aiRatingReason: text('ai_rating_reason'),
    ratedByUserId: uuid('rated_by_user_id').references(() => users.id),
    ratedAt: timestamptz('rated_at'),
    // Set when the team wrote the right answer for a bad AI reply and it became a taught answer.
    aiFixedAt: timestamptz('ai_fixed_at'),
    sentAt: timestamptz('sent_at'),
    deliveredAt: timestamptz('delivered_at'),
    readAt: timestamptz('read_at'),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: 'messages_conversation_id_store_fk',
      columns: [table.storeId, table.conversationId],
      foreignColumns: [conversations.storeId, conversations.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'messages_sender_identity_store_fk',
      columns: [table.storeId, table.senderIdentityId],
      foreignColumns: [contactIdentities.storeId, contactIdentities.id] as [
        AnyPgColumn,
        AnyPgColumn,
      ],
    }),
    foreignKey({
      name: 'messages_recipient_identity_store_fk',
      columns: [table.storeId, table.recipientIdentityId],
      foreignColumns: [contactIdentities.storeId, contactIdentities.id] as [
        AnyPgColumn,
        AnyPgColumn,
      ],
    }),

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
    index('messages_sender_identity_idx')
      .on(table.storeId, table.senderIdentityId)
      .where(sql`${table.senderIdentityId} is not null`),
    index('messages_recipient_identity_idx')
      .on(table.storeId, table.recipientIdentityId)
      .where(sql`${table.recipientIdentityId} is not null`),
    index('messages_rated_by_user_id_idx').on(table.ratedByUserId),
    check('messages_direction', isOneOf(table.direction, messageDirections)),
    check(
      'messages_inbound_sender',
      sql`${table.direction} <> 'in' or ${table.senderIdentityId} is not null`,
    ),
    check('messages_author_type', isOneOf(table.authorType, messageAuthorTypes)),
    check('messages_kind', isOneOf(table.kind, messageKinds)),
    check('messages_status', isOneOf(table.status, messageStatuses)),
    check('messages_source_type', isOneOf(table.sourceType, messageSourceTypes)),
    check('messages_send_category', isOneOf(table.sendCategory, messageSendCategories)),
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
    foreignKey({
      name: 'social_comments_channel_connection_id_store_fk',
      columns: [table.storeId, table.channelConnectionId],
      foreignColumns: [channelConnections.storeId, channelConnections.id] as [
        AnyPgColumn,
        AnyPgColumn,
      ],
    }),
    foreignKey({
      name: 'social_comments_post_target_id_store_fk',
      columns: [table.storeId, table.postTargetId],
      foreignColumns: [postTargets.storeId, postTargets.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'social_comments_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'social_comments_conversation_id_store_fk',
      columns: [table.storeId, table.conversationId],
      foreignColumns: [conversations.storeId, conversations.id] as [AnyPgColumn, AnyPgColumn],
    }),

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

// SMS sent outside a chat, campaign or workflow (campaign and workflow sends have their own rows).
// SMS is not a chat channel: Bangladesh A2P SMS cannot receive replies. Kept 13 months.
export const smsMessages = pgTable(
  'sms_messages',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    phone: text('phone').notNull(),
    purpose: text('purpose', { enum: smsMessagePurposes }).notNull(),
    // The order, payment intent or contact the message is about.
    subjectType: text('subject_type'),
    subjectId: uuid('subject_id'),
    senderIdId: uuid('sender_id_id').references(() => smsSenderIds.id),
    body: text('body').notNull(),
    parts: smallint('parts').notNull(),
    creditsUsed: integer('credits_used').notNull().default(0),
    status: text('status', { enum: smsMessageStatuses }).notNull().default('queued'),
    providerMessageId: text('provider_message_id'),
    errorCode: text('error_code'),
    idempotencyKey: text('idempotency_key').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    sentAt: timestamptz('sent_at'),
    deliveredAt: timestamptz('delivered_at'),
    failedAt: timestamptz('failed_at'),
    createdAt: createdAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      name: 'sms_messages_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'sms_messages_sender_id_id_store_fk',
      columns: [table.storeId, table.senderIdId],
      foreignColumns: [smsSenderIds.storeId, smsSenderIds.id] as [AnyPgColumn, AnyPgColumn],
    }),
    uniqueIndex('sms_messages_store_id_idempotency_key_key').on(
      table.storeId,
      table.idempotencyKey,
    ),
    index('sms_messages_store_id_subject_idx').on(
      table.storeId,
      table.subjectType,
      table.subjectId,
    ),
    index('sms_messages_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('sms_messages_contact_id_idx').on(table.contactId),
    index('sms_messages_sender_id_id_idx').on(table.senderIdId),
    index('sms_messages_created_by_user_id_idx').on(table.createdByUserId),
    uniqueIndex('sms_messages_provider_message_id_key')
      .on(table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    check('sms_messages_purpose', isOneOf(table.purpose, smsMessagePurposes)),
    check('sms_messages_status', isOneOf(table.status, smsMessageStatuses)),
    check('sms_messages_parts', sql`${table.parts} between 1 and 10 and ${table.creditsUsed} >= 0`),
  ],
);
