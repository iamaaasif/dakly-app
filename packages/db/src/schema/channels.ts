import { sql } from 'drizzle-orm';
import {
  foreignKey,
  type AnyPgColumn,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  channelConnectionKinds,
  channelConnectionStatuses,
  smsSenderIdStatuses,
} from '@dakly/contracts/channels';

import { users } from './auth';
import { bytea, createdAt, id, isOneOf, timestamptz, updatedAt } from './columns';
import { files } from './platform';
import { stores } from './stores';

// A connected Facebook Page, Instagram account or WhatsApp number. The webhook lookup key is
// (kind, external_account_id). The posting schedule and WhatsApp account ids live in settings.
export const channelConnections = pgTable(
  'channel_connections',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    kind: text('kind', { enum: channelConnectionKinds }).notNull(),
    externalAccountId: text('external_account_id').notNull(),
    displayName: text('display_name').notNull(),
    accessTokenCiphertext: bytea('access_token_ciphertext'),
    keyVersion: smallint('key_version'),
    tokenExpiresAt: timestamptz('token_expires_at'),
    status: text('status', { enum: channelConnectionStatuses }).notNull().default('active'),
    // Practice mode: until this is true the AI answers only the Test tab and the tester list.
    isAiLive: boolean('is_ai_live').notNull().default(false),
    whatsappQualityRating: text('whatsapp_quality_rating'),
    whatsappMessagingTier: text('whatsapp_messaging_tier'),
    settings: jsonb('settings').notNull().default({}),
    connectedByUserId: uuid('connected_by_user_id').references(() => users.id),
    connectedAt: timestamptz('connected_at').notNull().defaultNow(),
    disconnectedAt: timestamptz('disconnected_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('channel_connections_store_id_id_key').on(table.storeId, table.id),

    // One external account belongs to one store at a time, across all stores.
    uniqueIndex('channel_connections_account_key')
      .on(table.kind, table.externalAccountId)
      .where(sql`${table.status} <> 'disconnected'`),
    index('channel_connections_store_id_idx').on(table.storeId, table.kind),
    index('channel_connections_token_expires_at_idx')
      .on(table.tokenExpiresAt)
      .where(sql`${table.status} = 'active'`),
    index('channel_connections_connected_by_user_id_idx').on(table.connectedByUserId),
    check('channel_connections_kind', isOneOf(table.kind, channelConnectionKinds)),
    check('channel_connections_status', isOneOf(table.status, channelConnectionStatuses)),
  ],
);

// A Page Dakly subscribed to at Meta that no active connection backs yet or any more. It holds the
// Page token so the daily reconciliation can unsubscribe the Page after a crash or a disconnect.
export const metaPageSubscriptions = pgTable(
  'meta_page_subscriptions',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    pageExternalId: text('page_external_id').notNull(),
    accessTokenCiphertext: bytea('access_token_ciphertext').notNull(),
    keyVersion: smallint('key_version').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('meta_page_subscriptions_store_page_key').on(table.storeId, table.pageExternalId),
    index('meta_page_subscriptions_created_at_idx').on(table.createdAt),
  ],
);

// A shop's request for its own SMS sender name. NID and trade licence files are staff-only and
// deleted once the request is decided.
export const smsSenderIds = pgTable(
  'sms_sender_ids',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    senderName: text('sender_name').notNull(),
    status: text('status', { enum: smsSenderIdStatuses }).notNull().default('requested'),
    tradeLicenceFileId: uuid('trade_licence_file_id').references(() => files.id),
    nidFileId: uuid('nid_file_id').references(() => files.id),
    rejectionReason: text('rejection_reason'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
    decidedAt: timestamptz('decided_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: 'sms_sender_ids_trade_licence_file_id_store_fk',
      columns: [table.storeId, table.tradeLicenceFileId],
      foreignColumns: [files.storeId, files.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'sms_sender_ids_nid_file_id_store_fk',
      columns: [table.storeId, table.nidFileId],
      foreignColumns: [files.storeId, files.id] as [AnyPgColumn, AnyPgColumn],
    }),

    uniqueIndex('sms_sender_ids_store_id_id_key').on(table.storeId, table.id),
    // A store has one sender at a time: requested, in review or approved.
    uniqueIndex('sms_sender_ids_store_id_active_key')
      .on(table.storeId)
      .where(sql`${table.status} <> 'rejected'`),
    index('sms_sender_ids_store_id_idx').on(table.storeId),
    index('sms_sender_ids_status_idx').on(table.status),
    index('sms_sender_ids_trade_licence_file_id_idx').on(table.tradeLicenceFileId),
    index('sms_sender_ids_nid_file_id_idx').on(table.nidFileId),
    index('sms_sender_ids_requested_by_user_id_idx').on(table.requestedByUserId),
    check('sms_sender_ids_status', isOneOf(table.status, smsSenderIdStatuses)),
    check('sms_sender_ids_sender_name', sql`${table.senderName} ~ '^[A-Za-z0-9 ]{3,11}$'`),
  ],
);
