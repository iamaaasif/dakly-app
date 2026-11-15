import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  primaryKey,
} from 'drizzle-orm/pg-core';

import {
  actorTypes,
  filePurposes,
  fileStatuses,
  maintenanceRollups,
  notificationCategories,
  notificationStatuses,
  webhookEventStatuses,
  webhookProviders,
} from '@dakly/contracts/platform';

import { uuidv7 } from '../uuid-v7';
import { staffUsers } from './admin';
import { users } from './auth';
import { bytea, createdAt, id, inet, isOneOf, poisha, timestamptz, updatedAt } from './columns';
import { stores } from './stores';

// Append-only history of changes to consent, roles, billing, AI settings and orders. It is
// also the order timeline (stage changes are rows here), so there is no second event table.
export const auditLog = pgTable(
  'audit_log',
  {
    // Partitioned by month on created_at, so the key includes it (docs/data/growth.md).
    id: uuid('id').notNull().$defaultFn(uuidv7),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    actorType: text('actor_type', { enum: actorTypes }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    actorStaffId: uuid('actor_staff_id').references(() => staffUsers.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    reason: text('reason'),
    ip: inet('ip'),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ name: 'audit_log_pkey', columns: [table.id, table.createdAt] }),
    index('audit_log_store_id_entity_idx').on(
      table.storeId,
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    index('audit_log_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('audit_log_actor_user_id_idx').on(table.actorUserId),
    index('audit_log_actor_staff_id_idx').on(table.actorStaffId),
    check('audit_log_actor_type', isOneOf(table.actorType, actorTypes)),
  ],
);

// Global, no RLS: the relay reads across stores. The app role may only insert; the relay
// claims and marks rows through SECURITY DEFINER functions. Payloads carry ids, never PII.
// No foreign key on store_id: rows are short-lived and must not block a store purge.
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: id(),
    storeId: uuid('store_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamptz('occurred_at').notNull().defaultNow(),
    claimedAt: timestamptz('claimed_at'),
    publishedAt: timestamptz('published_at'),
    attempts: smallint('attempts').notNull().default(0),
  },
  (table) => [
    index('outbox_events_unpublished_idx')
      .on(table.id)
      .where(sql`${table.publishedAt} is null`),
    index('outbox_events_published_at_idx').on(table.publishedAt),
  ],
);

// Raw provider webhooks, for dedupe and replay. Global because the store is not known until the
// intake job resolves it. The payload is cleared once processed and rows are deleted after 7 days.
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: id(),
    provider: text('provider', { enum: webhookProviders }).notNull(),
    externalId: text('external_id').notNull(),
    payload: jsonb('payload'),
    status: text('status', { enum: webhookEventStatuses }).notNull().default('received'),
    error: text('error'),
    receivedAt: timestamptz('received_at').notNull().defaultNow(),
    processedAt: timestamptz('processed_at'),
  },
  (table) => [
    uniqueIndex('webhook_events_provider_external_id_key').on(table.provider, table.externalId),
    index('webhook_events_received_at_idx').on(table.receivedAt),
    check('webhook_events_provider', isOneOf(table.provider, webhookProviders)),
    check('webhook_events_status', isOneOf(table.status, webhookEventStatuses)),
  ],
);

// One row per recipient, so one person marking a card done does not hide it for the team.
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category', { enum: notificationCategories }).notNull(),
    type: text('type').notNull(),
    priority: smallint('priority').notNull().default(0),
    title: text('title').notNull(),
    body: text('body'),
    actionContext: jsonb('action_context'),
    actionUrl: text('action_url'),
    estimatedValuePoisha: poisha('estimated_value_poisha'),
    status: text('status', { enum: notificationStatuses }).notNull().default('new'),
    snoozedUntil: timestamptz('snoozed_until'),
    dedupeKey: text('dedupe_key').notNull(),
    expiresAt: timestamptz('expires_at'),
    escalatedAt: timestamptz('escalated_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('notifications_store_id_user_id_dedupe_key_key').on(
      table.storeId,
      table.userId,
      table.dedupeKey,
    ),
    index('notifications_store_id_user_id_status_idx').on(
      table.storeId,
      table.userId,
      table.status,
      table.createdAt,
    ),
    index('notifications_user_id_idx').on(table.userId),
    check('notifications_category', isOneOf(table.category, notificationCategories)),
    check('notifications_status', isOneOf(table.status, notificationStatuses)),
  ],
);

// Every file a person uploads to R2 (object key stores/<store_id>/<purpose>/<uuid>). The API
// records it after the browser uploads with a presigned URL; status moves to ready after checks.
export const files = pgTable(
  'files',
  {
    id: id(),
    // Null only for staff exports and settlement reports, which belong to no store. The store
    // policy hides those rows from the app role.
    storeId: uuid('store_id').references(() => stores.id),
    purpose: text('purpose', { enum: filePurposes }).notNull(),
    objectKey: text('object_key').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: bytea('sha256'),
    status: text('status', { enum: fileStatuses }).notNull().default('pending'),
    rejectReason: text('reject_reason'),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id),
    uploadedByStaffId: uuid('uploaded_by_staff_id').references(() => staffUsers.id),
    expiresAt: timestamptz('expires_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('files_store_id_id_key').on(table.storeId, table.id),

    uniqueIndex('files_object_key_key').on(table.objectKey),
    index('files_store_id_purpose_idx').on(table.storeId, table.purpose, table.createdAt),
    index('files_uploaded_by_user_id_idx').on(table.uploadedByUserId),
    index('files_uploaded_by_staff_id_idx').on(table.uploadedByStaffId),
    index('files_expires_at_idx')
      .on(table.expiresAt)
      .where(sql`${table.expiresAt} is not null`),
    check('files_purpose', isOneOf(table.purpose, filePurposes)),
    check(
      'files_store',
      sql`(${table.storeId} is null) = (${table.purpose} in ('staff_export', 'settlement_report'))`,
    ),
    check('files_status', isOneOf(table.status, fileStatuses)),
    check('files_size', sql`${table.sizeBytes} > 0 and ${table.sizeBytes} <= 26214400`),
  ],
);

// How far each daily rollup is complete for every store (Asia/Dhaka days). The job advances it
// only after all stores finish a day, and drop_expired_partitions() refuses to drop a month the
// watermark has not passed, so a missed night can never lose raw rows (D31).
export const maintenanceWatermarks = pgTable(
  'maintenance_watermarks',
  {
    rollup: text('rollup', { enum: maintenanceRollups }).primaryKey(),
    completedThrough: date('completed_through').notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [check('maintenance_watermarks_rollup', isOneOf(table.rollup, maintenanceRollups))],
);
