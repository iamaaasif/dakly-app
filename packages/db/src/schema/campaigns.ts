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
  text,
  uniqueIndex,
  uuid,
  primaryKey,
  date,
} from 'drizzle-orm/pg-core';

import {
  type CampaignGoal,
  campaignApprovalFailureCodes,
  campaignChannels,
  campaignPauseReasons,
  campaignStatuses,
  messageCategories,
  recipientSkipReasons,
  recipientStatuses,
  type SmsCampaignContent,
  templateStatuses,
  whatsappQualityRatings,
  trackedLinkKinds,
  trackedLinkSourceTypes,
} from '@dakly/contracts/campaigns';

import { uuidv7 } from '../uuid-v7';
import { users } from './auth';
import { channelConnections } from './channels';
import { bytea, createdAt, id, isOneOf, poisha, timestamptz, updatedAt } from './columns';
import { contactIdentities, contacts } from './contacts';
import { stores } from './stores';

// WhatsApp message templates, synced with Meta per WhatsApp Business account.
export const whatsappTemplates = pgTable(
  'whatsapp_templates',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    channelConnectionId: uuid('channel_connection_id')
      .notNull()
      .references(() => channelConnections.id),
    name: text('name').notNull(),
    language: text('language').notNull(),
    category: text('category', { enum: messageCategories }).notNull(),
    components: jsonb('components').notNull(),
    metaTemplateId: text('meta_template_id'),
    status: text('status', { enum: templateStatuses }).notNull().default('draft'),
    rejectionReason: text('rejection_reason'),
    // Meta's rating for this template; a red template is paused before it hurts the number.
    qualityRating: text('quality_rating', { enum: whatsappQualityRatings })
      .notNull()
      .default('unknown'),
    isReadyMade: boolean('is_ready_made').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('whatsapp_templates_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'whatsapp_templates_channel_connection_id_store_fk',
      columns: [table.storeId, table.channelConnectionId],
      foreignColumns: [channelConnections.storeId, channelConnections.id] as [
        AnyPgColumn,
        AnyPgColumn,
      ],
    }),

    uniqueIndex('whatsapp_templates_name_key').on(
      table.channelConnectionId,
      table.name,
      table.language,
    ),
    index('whatsapp_templates_store_id_status_idx').on(table.storeId, table.status),
    check('whatsapp_templates_category', isOneOf(table.category, messageCategories)),
    check('whatsapp_templates_status', isOneOf(table.status, templateStatuses)),
    check(
      'whatsapp_templates_quality_rating',
      isOneOf(table.qualityRating, whatsappQualityRatings),
    ),
  ],
);

// Approval of a large audience runs as a job (CAMP-13).
const approvalColumns = {
  // The cursor is the last contact checked in the include segment at segment_index, so a retry
  // continues where the last committed batch stopped.
  approvalSegmentIndex: integer('approval_segment_index').notNull().default(0),
  approvalCursor: uuid('approval_cursor'),
  approvalCheckedCount: integer('approval_checked_count').notNull().default(0),
  // The include segments' counts when approval started: an upper bound, not the final audience.
  approvalEstimatedTotal: integer('approval_estimated_total').notNull().default(0),
  approvalProgressAt: timestamptz('approval_progress_at'),
  // Why the last approval went back to draft; a new approval clears it.
  approvalFailureCode: text('approval_failure_code', { enum: campaignApprovalFailureCodes }),
};

// The sweep that recovers a lost approval job reads campaigns by their last progress time.
const approvalConstraints = (
  table: Record<'id' | 'status' | 'approvalProgressAt' | 'approvalFailureCode', AnyPgColumn>,
) => [
  index('campaigns_approving_idx')
    .on(table.approvalProgressAt, table.id)
    .where(sql`${table.status} = 'approving'`),
  check(
    'campaigns_approval_failure_code',
    isOneOf(table.approvalFailureCode, campaignApprovalFailureCodes),
  ),
];

// One message to a frozen audience, once, after approval. Counts are roll-ups refreshed every
// minute from campaign_recipients so the list page never counts recipients.
export const campaigns = pgTable(
  'campaigns',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    goal: text('goal').$type<CampaignGoal>(),
    channel: text('channel', { enum: campaignChannels }).notNull(),
    // Frozen at approval; SMS uses the platform sender and has no channel connection.
    channelConnectionId: uuid('channel_connection_id').references(() => channelConnections.id),
    category: text('category', { enum: messageCategories }).notNull().default('marketing'),
    whatsappTemplateId: uuid('whatsapp_template_id').references(() => whatsappTemplates.id),
    content: jsonb('content').$type<SmsCampaignContent>().notNull(),
    includeSegmentIds: uuid('include_segment_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    excludeSegmentIds: uuid('exclude_segment_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    status: text('status', { enum: campaignStatuses }).notNull().default('draft'),
    pauseReason: text('pause_reason', { enum: campaignPauseReasons }),
    balancePauseRevision: integer('balance_pause_revision'),
    isAiWritten: boolean('is_ai_written').notNull().default(false),
    scheduledFor: timestamptz('scheduled_for'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamptz('approved_at'),
    ...approvalColumns,
    shortLinkBase: text('short_link_base'),
    startedAt: timestamptz('started_at'),
    finishedAt: timestamptz('finished_at'),
    settlementPendingAt: timestamptz('settlement_pending_at'),
    settledAt: timestamptz('settled_at'),
    estimatedCostPoisha: poisha('estimated_cost_poisha'),
    reservedPoisha: poisha('reserved_poisha').notNull().default(0),
    actualCostPoisha: poisha('actual_cost_poisha').notNull().default(0),
    recipientsCount: integer('recipients_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    sentCount: integer('sent_count').notNull().default(0),
    deliveredCount: integer('delivered_count').notNull().default(0),
    readCount: integer('read_count').notNull().default(0),
    tappedCount: integer('tapped_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    countsAt: timestamptz('counts_at'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('campaigns_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'campaigns_channel_connection_id_store_fk',
      columns: [table.storeId, table.channelConnectionId],
      foreignColumns: [channelConnections.storeId, channelConnections.id] as [
        AnyPgColumn,
        AnyPgColumn,
      ],
    }),
    foreignKey({
      name: 'campaigns_whatsapp_template_id_store_fk',
      columns: [table.storeId, table.whatsappTemplateId],
      foreignColumns: [whatsappTemplates.storeId, whatsappTemplates.id] as [
        AnyPgColumn,
        AnyPgColumn,
      ],
    }),

    index('campaigns_store_id_status_idx').on(table.storeId, table.status, table.createdAt),
    index('campaigns_store_id_created_at_id_idx').on(table.storeId, table.createdAt, table.id),
    index('campaigns_due_idx')
      .on(table.scheduledFor)
      .where(sql`${table.status} = 'scheduled'`),
    index('campaigns_start_due_by_store_idx')
      .on(table.storeId, table.scheduledFor, table.id)
      .where(sql`${table.status} = 'scheduled'`),
    index('campaigns_send_work_idx')
      .on(table.storeId, table.startedAt, table.id)
      .where(
        sql`${table.status} = 'sending' or (${table.status} = 'cancelled' and ${table.settlementPendingAt} is not null)`,
      ),
    ...approvalConstraints(table),
    index('campaigns_balance_paused_idx')
      .on(table.storeId, table.id)
      .where(sql`${table.status} = 'paused' and ${table.pauseReason} = 'balance'`),
    index('campaigns_counts_pending_idx')
      .on(table.storeId, table.id)
      .where(
        sql`${table.countsAt} is null and ${table.approvedAt} is not null and ${table.status} in ('paused', 'sent', 'cancelled', 'failed')`,
      ),
    index('campaigns_channel_connection_id_idx').on(table.channelConnectionId),
    index('campaigns_whatsapp_template_id_idx').on(table.whatsappTemplateId),
    index('campaigns_approved_by_user_id_idx').on(table.approvedByUserId),
    index('campaigns_created_by_user_id_idx').on(table.createdByUserId),
    check(
      'campaigns_connection',
      sql`case when ${table.channel} = 'sms' then ${table.channelConnectionId} is null else ${table.status} = 'draft' or ${table.channelConnectionId} is not null end`,
    ),
    check('campaigns_channel', isOneOf(table.channel, campaignChannels)),
    check('campaigns_category', isOneOf(table.category, messageCategories)),
    check('campaigns_status', isOneOf(table.status, campaignStatuses)),
    check(
      'campaigns_pause_reason',
      sql`(${table.status} = 'paused') = (${table.pauseReason} is not null)`,
    ),
    check(
      'campaigns_whatsapp_template',
      sql`${table.channel} <> 'whatsapp' or ${table.status} = 'draft' or ${table.whatsappTemplateId} is not null`,
    ),
  ],
);

// The frozen audience: one row per contact, written at approval, with the reason for every skip.
// The sender claims queued rows and recovers expired claims with the same operation key.
export const campaignRecipients = pgTable(
  'campaign_recipients',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    // Identity must belong to this contact and the campaign's frozen connection. SMS has none.
    contactIdentityId: uuid('contact_identity_id').references(() => contactIdentities.id),
    // Phone or page-scoped id at freeze time.
    destinationAddress: text('destination_address'),
    status: text('status', { enum: recipientStatuses }).notNull(),
    claimedAt: timestamptz('claimed_at'),
    // Receipt lookup renews the lease while the frequency cap keeps using the dispatch time.
    dispatchStartedAt: timestamptz('dispatch_started_at'),
    optOutLinkCode: text('opt_out_link_code'),
    redirectLinkCodes: text('redirect_link_codes').array(),
    skipReason: text('skip_reason', { enum: recipientSkipReasons }),
    providerMessageId: text('provider_message_id'),
    costPoisha: poisha('cost_poisha'),
    errorCode: text('error_code'),
    sentAt: timestamptz('sent_at'),
    deliveredAt: timestamptz('delivered_at'),
    readAt: timestamptz('read_at'),
    tappedAt: timestamptz('tapped_at'),
    failedAt: timestamptz('failed_at'),
    // Credits of a message the provider took or may have taken.
    smsCredits: integer('sms_credits'),
    // Cap retries while the provider outcome stays unresolved.
    sendAttempts: integer('send_attempts').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: 'campaign_recipients_campaign_id_store_fk',
      columns: [table.storeId, table.campaignId],
      foreignColumns: [campaigns.storeId, campaigns.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    foreignKey({
      name: 'campaign_recipients_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    foreignKey({
      name: 'campaign_recipients_contact_identity_id_store_fk',
      columns: [table.storeId, table.contactIdentityId],
      foreignColumns: [contactIdentities.storeId, contactIdentities.id] as [
        AnyPgColumn,
        AnyPgColumn,
      ],
    }),

    uniqueIndex('campaign_recipients_campaign_contact_key').on(table.campaignId, table.contactId),
    index('campaign_recipients_campaign_status_idx').on(table.campaignId, table.status, table.id),
    // Frequency cap and last-touch attribution look up a contact's recent sends.
    index('campaign_recipients_store_contact_idx').on(table.storeId, table.contactId, table.sentAt),
    // Analytics reads the sends of a period.
    index('campaign_recipients_store_sent_at_idx').on(table.storeId, table.sentAt),
    // Global, for SMS delivery reports that carry only the provider's message id.
    index('campaign_recipients_provider_message_idx')
      .on(table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    index('campaign_recipients_contact_identity_id_idx').on(table.contactIdentityId),
    index('campaign_recipients_contact_id_idx').on(table.contactId),
    check('campaign_recipients_status', isOneOf(table.status, recipientStatuses)),
    check(
      'campaign_recipients_skip_reason',
      sql`(${table.status} = 'skipped') = (${table.skipReason} is not null)`,
    ),
    check('campaign_recipients_skip_reason_value', isOneOf(table.skipReason, recipientSkipReasons)),
  ],
);

// Short links (dkly.co/abc) wrapped per recipient so taps can be attributed, and the one-tap
// SMS opt-out links (CAMP-R4). The redirect service resolves them through a SECURITY DEFINER function.
export const trackedLinks = pgTable(
  'tracked_links',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    code: text('code').notNull(),
    kind: text('kind', { enum: trackedLinkKinds }).notNull().default('redirect'),
    targetUrl: text('target_url'),
    sourceType: text('source_type', { enum: trackedLinkSourceTypes }).notNull(),
    sourceId: uuid('source_id'),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    tapCount: integer('tap_count').notNull().default(0),
    firstTappedAt: timestamptz('first_tapped_at'),
    lastTappedAt: timestamptz('last_tapped_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('tracked_links_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'tracked_links_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),

    uniqueIndex('tracked_links_code_key').on(table.code),
    index('tracked_links_source_idx').on(table.storeId, table.sourceType, table.sourceId),
    index('tracked_links_store_contact_idx').on(table.storeId, table.contactId, table.lastTappedAt),
    index('tracked_links_contact_id_idx').on(table.contactId),
    check('tracked_links_kind', isOneOf(table.kind, trackedLinkKinds)),
    check('tracked_links_source_type', isOneOf(table.sourceType, trackedLinkSourceTypes)),
    check(
      'tracked_links_redirect_target',
      sql`${table.kind} <> 'redirect' or ${table.targetUrl} is not null`,
    ),
    check(
      'tracked_links_opt_out_contact',
      sql`${table.kind} <> 'sms_opt_out' or ${table.contactId} is not null`,
    ),
  ],
);

// Exact tap times survive the 372-day attribution horizon in 13 months of raw partitions.
// visitor_hash is a daily-rotating HMAC for daily visitor counts; raw IPs and agents are not kept.
export const trackedLinkVisits = pgTable(
  'tracked_link_visits',
  {
    id: uuid('id').notNull().$defaultFn(uuidv7),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    trackedLinkId: uuid('tracked_link_id')
      .notNull()
      .references(() => trackedLinks.id, { onDelete: 'cascade' }),
    eventKey: text('event_key').notNull(),
    occurredAt: timestamptz('occurred_at').notNull(),
    visitorHash: bytea('visitor_hash'),
  },
  (table) => [
    foreignKey({
      name: 'tracked_link_visits_tracked_link_id_store_fk',
      columns: [table.storeId, table.trackedLinkId],
      foreignColumns: [trackedLinks.storeId, trackedLinks.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),

    primaryKey({ name: 'tracked_link_visits_pkey', columns: [table.id, table.occurredAt] }),
    // A retry carries the tap's original time, so the key still dedupes inside the partition.
    uniqueIndex('tracked_link_visits_store_event_key').on(
      table.storeId,
      table.eventKey,
      table.occurredAt,
    ),
    index('tracked_link_visits_link_occurred_idx').on(table.trackedLinkId, table.occurredAt),
  ],
);

// Daily link counts serve reports older than the 13 raw months and stay while the link exists.
// Attribution uses exact raw visits throughout its rebuild horizon, never these summaries.
export const trackedLinkVisitDays = pgTable(
  'tracked_link_visit_days',
  {
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    trackedLinkId: uuid('tracked_link_id')
      .notNull()
      .references(() => trackedLinks.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    visits: integer('visits').notNull(),
    uniqueVisitors: integer('unique_visitors').notNull(),
    firstAt: timestamptz('first_at').notNull(),
    lastAt: timestamptz('last_at').notNull(),
  },
  (table) => [
    primaryKey({ name: 'tracked_link_visit_days_pkey', columns: [table.trackedLinkId, table.day] }),
    foreignKey({
      name: 'tracked_link_visit_days_tracked_link_id_store_fk',
      columns: [table.storeId, table.trackedLinkId],
      foreignColumns: [trackedLinks.storeId, trackedLinks.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    index('tracked_link_visit_days_store_id_day_idx').on(table.storeId, table.day),
    check(
      'tracked_link_visit_days_counts',
      sql`${table.visits} >= ${table.uniqueVisitors} and ${table.uniqueVisitors} >= 0`,
    ),
  ],
);
