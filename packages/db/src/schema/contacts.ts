import { sql } from 'drizzle-orm';
import {
  foreignKey,
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { chatChannels } from '@dakly/contracts/channels';
import {
  consentChannels,
  consentSources,
  consentStatuses,
  contactKinds,
  contactSources,
  genders,
  lifecycleStages,
  matchSuggestionReasons,
  matchSuggestionStatuses,
  notCustomerReasons,
} from '@dakly/contracts/contacts';
import type { SegmentRules } from '@dakly/contracts/segments';

import { bdAreas } from './areas';
import { users } from './auth';
import { channelConnections } from './channels';
import { citext, createdAt, id, isOneOf, poisha, timestamptz, updatedAt } from './columns';
import { imports } from './imports';
import { stores } from './stores';

const phoneFormat = `'^01[3-9][0-9]{8}$'`;

// One person in one store, the buyer on their orders. A chat contact can exist with no phone,
// known only by its channel identities. Another recipient's delivery details stay on the order
// and never find, fill or merge a contact (D26, D27).
export const contacts = pgTable(
  'contacts',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name'),
    // The person's own phone (D27): saved when they give it for an order to themselves, from a
    // WhatsApp sender, an import or a staff edit. Saving it proves nothing about who owns it.
    // Once set, only a direct profile edit changes it.
    phone: text('phone'),
    // Set only when the phone comes from the WhatsApp sender identity itself.
    phoneVerifiedAt: timestamptz('phone_verified_at'),
    whatsappPhone: text('whatsapp_phone'),
    email: citext('email'),
    address: text('address'),
    district: text('district'),
    bdAreaId: integer('bd_area_id').references(() => bdAreas.id),
    gender: text('gender', { enum: genders }),
    birthdayDay: smallint('birthday_day'),
    birthdayMonth: smallint('birthday_month'),
    birthYear: smallint('birth_year'),
    source: text('source', { enum: contactSources }).notNull(),
    // Customer after a non-cancelled order or an intentional manual/import/sync add.
    // Cancelling the last order does not undo an intentional customer classification.
    kind: text('kind', { enum: contactKinds }).notNull(),
    notCustomerReason: text('not_customer_reason', { enum: notCustomerReasons }),
    isBlocked: boolean('is_blocked').notNull().default(false),
    // ACC-R8: saved but left out of campaigns until the plan allows more customers.
    isOverPlanLimit: boolean('is_over_plan_limit').notNull().default(false),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text('notes'),
    externalRef: text('external_ref'),
    // The import that created this contact, so its undo removes only what it added.
    importId: uuid('import_id'),
    deletedAt: timestamptz('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('contacts_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'contacts_import_id_store_fk',
      columns: [table.storeId, table.importId],
      foreignColumns: [imports.storeId, imports.id] as [AnyPgColumn, AnyPgColumn],
    }),

    uniqueIndex('contacts_store_id_phone_key')
      .on(table.storeId, table.phone)
      .where(sql`${table.phone} is not null and ${table.deletedAt} is null`),
    uniqueIndex('contacts_store_id_external_ref_key')
      .on(table.storeId, table.externalRef)
      .where(sql`${table.externalRef} is not null`),
    index('contacts_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('contacts_store_id_kind_idx').on(table.storeId, table.kind),
    index('contacts_store_id_email_idx').on(table.storeId, table.email),
    index('contacts_tags_idx').using('gin', table.tags),
    index('contacts_name_trgm_idx').using('gin', sql`${table.name} gin_trgm_ops`),
    index('contacts_phone_pattern_idx').on(table.storeId, sql`${table.phone} text_pattern_ops`),
    index('contacts_bd_area_id_idx').on(table.bdAreaId),
    index('contacts_store_id_import_id_idx').on(table.storeId, table.importId),
    index('contacts_deleted_at_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} is not null`),
    check('contacts_phone_format', sql`${table.phone} ~ ${sql.raw(phoneFormat)}`),
    check('contacts_whatsapp_phone_format', sql`${table.whatsappPhone} ~ ${sql.raw(phoneFormat)}`),
    check(
      'contacts_verified_needs_phone',
      sql`${table.phoneVerifiedAt} is null or ${table.phone} is not null`,
    ),
    check('contacts_source', isOneOf(table.source, contactSources)),
    check('contacts_kind', isOneOf(table.kind, contactKinds)),
    check(
      'contacts_not_customer_reason',
      sql`(${table.kind} = 'not_customer') = (${table.notCustomerReason} is not null)`,
    ),
    check('contacts_gender', isOneOf(table.gender, genders)),
    check(
      'contacts_birthday',
      sql`${table.birthdayDay} between 1 and 31 and ${table.birthdayMonth} between 1 and 12`,
    ),
  ],
);

// Merge request identity survives undo and erasure, so a delayed retry cannot merge again.
// Before/after evidence supports conflict-aware undo for 7 days (D29); purge redacts that evidence.
export const contactMerges = pgTable(
  'contact_merges',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    operationKey: text('operation_key').notNull(),
    keptContactId: uuid('kept_contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    mergedContactId: uuid('merged_contact_id').references(() => contacts.id, {
      onDelete: 'set null',
    }),
    movedRows: jsonb('moved_rows').notNull(),
    replacedFields: jsonb('replaced_fields').notNull(),
    // Field values and moved-row versions immediately after merge; later edits must survive undo.
    afterState: jsonb('after_state').notNull(),
    undoConflicts: jsonb('undo_conflicts').notNull().default([]),
    evidenceRedactedAt: timestamptz('evidence_redacted_at'),
    mergedByUserId: uuid('merged_by_user_id')
      .notNull()
      .references(() => users.id),
    undoUntil: timestamptz('undo_until').notNull(),
    undoneAt: timestamptz('undone_at'),
    undoneByUserId: uuid('undone_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: 'contact_merges_kept_contact_id_store_fk',
      columns: [table.storeId, table.keptContactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'contact_merges_merged_contact_id_store_fk',
      columns: [table.storeId, table.mergedContactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }),

    uniqueIndex('contact_merges_store_id_operation_key_key').on(table.storeId, table.operationKey),
    // A contact can be merged away once at a time; undoing frees it again.
    uniqueIndex('contact_merges_merged_contact_id_key')
      .on(table.mergedContactId)
      .where(sql`${table.undoneAt} is null`),
    index('contact_merges_kept_contact_id_idx').on(table.keptContactId),
    index('contact_merges_merged_contact_id_idx').on(table.mergedContactId),
    index('contact_merges_store_id_kept_contact_id_idx').on(table.storeId, table.keptContactId),
    index('contact_merges_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('contact_merges_merged_by_user_id_idx').on(table.mergedByUserId),
    index('contact_merges_undone_by_user_id_idx').on(table.undoneByUserId),
    check('contact_merges_two_contacts', sql`${table.keptContactId} <> ${table.mergedContactId}`),
  ],
);

// Two contacts that may be one person, for staff to merge or dismiss. A self-delivery phone that
// already belongs to another contact lands here and stays only on the order (D27). order_id and
// conversation_id say where it came from; they have no foreign key so contacts does not depend
// on orders or chats.
export const contactMatchSuggestions = pgTable(
  'contact_match_suggestions',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    matchedContactId: uuid('matched_contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    reason: text('reason', { enum: matchSuggestionReasons }).notNull(),
    phone: text('phone'),
    orderId: uuid('order_id'),
    conversationId: uuid('conversation_id'),
    status: text('status', { enum: matchSuggestionStatuses }).notNull().default('open'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id),
    decidedAt: timestamptz('decided_at'),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: 'contact_match_suggestions_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    foreignKey({
      name: 'contact_match_suggestions_matched_contact_id_store_fk',
      columns: [table.storeId, table.matchedContactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),

    uniqueIndex('contact_match_suggestions_open_key')
      .on(table.storeId, table.contactId, table.matchedContactId, table.reason)
      .where(sql`${table.status} = 'open'`),
    index('contact_match_suggestions_store_id_status_created_at_idx').on(
      table.storeId,
      table.status,
      table.createdAt,
    ),
    index('contact_match_suggestions_contact_id_idx').on(table.contactId),
    index('contact_match_suggestions_matched_contact_id_idx').on(table.matchedContactId),
    index('contact_match_suggestions_store_id_order_id_idx')
      .on(table.storeId, table.orderId)
      .where(sql`${table.orderId} is not null`),
    index('contact_match_suggestions_decided_by_user_id_idx').on(table.decidedByUserId),
    check('contact_match_suggestions_reason', isOneOf(table.reason, matchSuggestionReasons)),
    check('contact_match_suggestions_status', isOneOf(table.status, matchSuggestionStatuses)),
    check(
      'contact_match_suggestions_two_contacts',
      sql`${table.contactId} <> ${table.matchedContactId}`,
    ),
    check('contact_match_suggestions_phone_format', sql`${table.phone} ~ ${sql.raw(phoneFormat)}`),
  ],
);

// One person, many channel ids. Messenger and Instagram ids are scoped to one Page or account,
// so the key includes the connection.
export const contactIdentities = pgTable(
  'contact_identities',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    channelConnectionId: uuid('channel_connection_id')
      .notNull()
      .references(() => channelConnections.id),
    channel: text('channel', { enum: chatChannels }).notNull(),
    externalId: text('external_id').notNull(),
    profileName: text('profile_name'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('contact_identities_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'contact_identities_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    foreignKey({
      name: 'contact_identities_channel_connection_id_store_fk',
      columns: [table.storeId, table.channelConnectionId],
      foreignColumns: [channelConnections.storeId, channelConnections.id] as [
        AnyPgColumn,
        AnyPgColumn,
      ],
    }),

    uniqueIndex('contact_identities_connection_external_id_key').on(
      table.channelConnectionId,
      table.externalId,
    ),
    index('contact_identities_contact_id_idx').on(table.contactId),
    index('contact_identities_store_id_idx').on(table.storeId),
    check('contact_identities_channel', isOneOf(table.channel, chatChannels)),
  ],
);

// Append-only consent history per contact and channel; the latest row wins. Sending reads the
// contact_consent_current view (created in the migration with security_invoker, so RLS applies).
export const consents = pgTable(
  'consents',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    channel: text('channel', { enum: consentChannels }).notNull(),
    status: text('status', { enum: consentStatuses }).notNull(),
    source: text('source', { enum: consentSources }).notNull(),
    importId: uuid('import_id'),
    evidence: text('evidence'),
    capturedByUserId: uuid('captured_by_user_id').references(() => users.id),
    capturedAt: timestamptz('captured_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'consents_import_id_store_fk',
      columns: [table.storeId, table.importId],
      foreignColumns: [imports.storeId, imports.id] as [AnyPgColumn, AnyPgColumn],
    }),
    index('consents_store_id_import_id_idx').on(table.storeId, table.importId, table.id),
    foreignKey({
      name: 'consents_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),

    index('consents_contact_channel_idx').on(
      table.storeId,
      table.contactId,
      table.channel,
      table.capturedAt,
    ),
    index('consents_contact_id_idx').on(table.contactId),
    index('consents_captured_by_user_id_idx').on(table.capturedByUserId),
    check('consents_channel', isOneOf(table.channel, consentChannels)),
    check('consents_status', isOneOf(table.status, consentStatuses)),
    check('consents_source', isOneOf(table.source, consentSources)),
  ],
);

// Derived buyer numbers per contact, kept apart from contacts so frequent writes do not rewrite the
// wide contact row. Recomputed for one contact on each order event. Lists and segments read it.
// Return risk is not here: it belongs to the delivery phone and is read from orders (D26).
export const contactStats = pgTable(
  'contact_stats',
  {
    contactId: uuid('contact_id')
      .primaryKey()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    ordersCount: integer('orders_count').notNull().default(0),
    deliveredCount: integer('delivered_count').notNull().default(0),
    returnedCount: integer('returned_count').notNull().default(0),
    netSpendPoisha: poisha('net_spend_poisha').notNull().default(0),
    firstOrderAt: timestamptz('first_order_at'),
    lastOrderAt: timestamptz('last_order_at'),
    usualGapDays: integer('usual_gap_days'),
    favouriteCategory: text('favourite_category'),
    lifecycleStage: text('lifecycle_stage', { enum: lifecycleStages }).notNull().default('none'),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: 'contact_stats_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),

    index('contact_stats_store_id_stage_idx').on(table.storeId, table.lifecycleStage),
    index('contact_stats_store_id_last_order_at_idx').on(table.storeId, table.lastOrderAt),
    index('contact_stats_store_id_net_spend_idx').on(table.storeId, table.netSpendPoisha),
    check('contact_stats_lifecycle_stage', isOneOf(table.lifecycleStage, lifecycleStages)),
    check('contact_stats_counts', sql`${table.ordersCount} >= 0 and ${table.deliveredCount} >= 0`),
    check('contact_stats_returned_count', sql`${table.returnedCount} >= 0`),
  ],
);

// Saved segments keep store edits separately so a ready-made segment can be reset (SEG-R1).
export const segments = pgTable(
  'segments',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    readyMadeKey: text('ready_made_key'),
    // Condition tree validated by the contracts schema and compiled to bound SQL; never filtered on.
    rules: jsonb('rules').$type<SegmentRules>().notNull(),
    aiPrompt: text('ai_prompt'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('segments_store_id_name_key').on(table.storeId, table.name),
    uniqueIndex('segments_store_id_ready_made_key_key')
      .on(table.storeId, table.readyMadeKey)
      .where(sql`${table.readyMadeKey} is not null`),
    index('segments_created_by_user_id_idx').on(table.createdByUserId),
  ],
);
