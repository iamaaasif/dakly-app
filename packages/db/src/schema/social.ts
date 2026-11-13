import { sql } from 'drizzle-orm';
import {
  foreignKey,
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  contentKinds,
  contentLanguages,
  postKinds,
  postTargetStatuses,
} from '@dakly/contracts/social';
import { users } from './auth';
import { channelConnections } from './channels';
import { createdAt, id, isOneOf, timestamptz, updatedAt } from './columns';
import { stores } from './stores';

// One row per store; feeds every caption and AI message the shop sends.
export const brandProfiles = pgTable(
  'brand_profiles',
  {
    storeId: uuid('store_id')
      .primaryKey()
      .references(() => stores.id),
    voice: text('voice'),
    audience: text('audience'),
    preferredWords: text('preferred_words')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    callToActionBn: text('call_to_action_bn'),
    callToActionEn: text('call_to_action_en'),
    tone: text('tone'),
    languages: text('languages')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    wordsToAvoid: text('words_to_avoid')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    hashtags: text('hashtags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    allowsEmoji: boolean('allows_emoji').notNull().default(false),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id),
    updatedAt: updatedAt(),
  },
  (table) => [index('brand_profiles_updated_by_user_id_idx').on(table.updatedByUserId)],
);

// Saved library text is user content, separate from model-call telemetry in ai_runs.
export const contentPieces = pgTable(
  'content_pieces',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    kind: text('kind', { enum: contentKinds }).notNull(),
    language: text('language', { enum: contentLanguages }).notNull(),
    body: text('body').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    isAiWritten: boolean('is_ai_written').notNull().default(false),
    // Plain reference: ai_runs is partitioned by month and expires (docs/data/growth.md).
    aiRunId: uuid('ai_run_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('content_pieces_store_created_idx').on(table.storeId, table.createdAt, table.id),
    index('content_pieces_store_kind_language_idx').on(
      table.storeId,
      table.kind,
      table.language,
      table.createdAt,
      table.id,
    ),
    index('content_pieces_created_by_user_id_idx').on(table.createdByUserId),
    check('content_pieces_kind', isOneOf(table.kind, contentKinds)),
    check('content_pieces_language', isOneOf(table.language, contentLanguages)),
    check('content_pieces_body_length', sql`char_length(${table.body}) between 1 and 20000`),
    check('content_pieces_ai_provenance', sql`${table.aiRunId} is null or ${table.isAiWritten}`),
  ],
);

// The content once; each account it goes to is a post_targets row with its own status.
export const posts = pgTable(
  'posts',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    kind: text('kind', { enum: postKinds }).notNull().default('post'),
    caption: text('caption'),
    mediaFileIds: uuid('media_file_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    linkUrl: text('link_url'),
    firstComment: text('first_comment'),
    // D7: AI-written captions need a person's approval before they can be scheduled.
    isAiWritten: boolean('is_ai_written').notNull().default(false),
    // Plain reference: ai_runs is partitioned by month and expires (docs/data/growth.md).
    aiRunId: uuid('ai_run_id'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamptz('approved_at'),
    deletedAt: timestamptz('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('posts_store_id_id_key').on(table.storeId, table.id),

    index('posts_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('posts_created_by_user_id_idx').on(table.createdByUserId),
    index('posts_approved_by_user_id_idx').on(table.approvedByUserId),
    check('posts_kind', isOneOf(table.kind, postKinds)),
    check('posts_caption_length', sql`char_length(${table.caption}) <= 20000`),
  ],
);

export const postTargets = pgTable(
  'post_targets',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    channelConnectionId: uuid('channel_connection_id')
      .notNull()
      .references(() => channelConnections.id),
    // Null falls back to posts.caption; an empty override deliberately sends no caption.
    captionOverride: text('caption_override'),
    status: text('status', { enum: postTargetStatuses }).notNull().default('draft'),
    scheduledFor: timestamptz('scheduled_for'),
    // Instagram container id, saved before publish so a retry continues instead of posting twice.
    containerId: text('container_id'),
    externalPostId: text('external_post_id'),
    publishedAt: timestamptz('published_at'),
    attempts: smallint('attempts').notNull().default(0),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    reach: integer('reach'),
    reactions: integer('reactions'),
    comments: integer('comments'),
    shares: integer('shares'),
    linkTaps: integer('link_taps'),
    metricsAt: timestamptz('metrics_at'),
    nextMetricsAt: timestamptz('next_metrics_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('post_targets_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'post_targets_post_id_store_fk',
      columns: [table.storeId, table.postId],
      foreignColumns: [posts.storeId, posts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    foreignKey({
      name: 'post_targets_channel_connection_id_store_fk',
      columns: [table.storeId, table.channelConnectionId],
      foreignColumns: [channelConnections.storeId, channelConnections.id] as [
        AnyPgColumn,
        AnyPgColumn,
      ],
    }),

    // Settles the race for a posting slot: the second post moves to the next free slot.
    uniqueIndex('post_targets_slot_key')
      .on(table.channelConnectionId, table.scheduledFor)
      .where(sql`${table.status} in ('scheduled', 'publishing')`),
    uniqueIndex('post_targets_external_post_id_key')
      .on(table.channelConnectionId, table.externalPostId)
      .where(sql`${table.externalPostId} is not null`),
    uniqueIndex('post_targets_post_connection_key').on(table.postId, table.channelConnectionId),
    index('post_targets_channel_connection_id_idx').on(table.channelConnectionId),
    index('post_targets_store_id_scheduled_for_idx').on(table.storeId, table.scheduledFor),
    index('post_targets_due_idx')
      .on(table.scheduledFor)
      .where(sql`${table.status} = 'scheduled'`),
    index('post_targets_metrics_due_idx')
      .on(table.nextMetricsAt)
      .where(sql`${table.nextMetricsAt} is not null`),
    check(
      'post_targets_caption_override_length',
      sql`char_length(${table.captionOverride}) <= 20000`,
    ),
    check('post_targets_status', isOneOf(table.status, postTargetStatuses)),
    check(
      'post_targets_scheduled_has_time',
      sql`${table.status} not in ('scheduled', 'publishing') or ${table.scheduledFor} is not null`,
    ),
  ],
);
