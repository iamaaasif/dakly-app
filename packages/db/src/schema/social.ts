import { sql } from 'drizzle-orm';
import {
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
import { postKinds, postTargetStatuses } from '@dakly/contracts/social';
import { aiRuns } from './ai';
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
    aiRunId: uuid('ai_run_id').references(() => aiRuns.id),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamptz('approved_at'),
    deletedAt: timestamptz('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('posts_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('posts_ai_run_id_idx').on(table.aiRunId),
    index('posts_created_by_user_id_idx').on(table.createdByUserId),
    index('posts_approved_by_user_id_idx').on(table.approvedByUserId),
    check('posts_kind', isOneOf(table.kind, postKinds)),
    check('posts_caption_length', sql`char_length(${table.caption}) <= 2200`),
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
    // Settles the race for a posting slot: the second post moves to the next free slot.
    uniqueIndex('post_targets_slot_key')
      .on(table.channelConnectionId, table.scheduledFor)
      .where(sql`${table.status} in ('scheduled', 'publishing')`),
    uniqueIndex('post_targets_external_post_id_key')
      .on(table.channelConnectionId, table.externalPostId)
      .where(sql`${table.externalPostId} is not null`),
    index('post_targets_post_id_idx').on(table.postId),
    index('post_targets_store_id_scheduled_for_idx').on(table.storeId, table.scheduledFor),
    index('post_targets_due_idx')
      .on(table.scheduledFor)
      .where(sql`${table.status} = 'scheduled'`),
    index('post_targets_metrics_due_idx')
      .on(table.nextMetricsAt)
      .where(sql`${table.nextMetricsAt} is not null`),
    check('post_targets_status', isOneOf(table.status, postTargetStatuses)),
    check(
      'post_targets_scheduled_has_time',
      sql`${table.status} not in ('scheduled', 'publishing') or ${table.scheduledFor} is not null`,
    ),
  ],
);
