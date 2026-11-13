import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  campaignChannels,
  campaignPauseReasons,
  campaignStatuses,
  messageCategories,
  recipientSkipReasons,
  recipientStatuses,
  templateStatuses,
  trackedLinkKinds,
  trackedLinkSourceTypes,
} from '@dakly/contracts/campaigns';
import { users } from './auth';
import { channelConnections } from './channels';
import { createdAt, id, isOneOf, poisha, timestamptz, updatedAt } from './columns';
import { contacts } from './contacts';
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
    isReadyMade: boolean('is_ready_made').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('whatsapp_templates_name_key').on(
      table.channelConnectionId,
      table.name,
      table.language,
    ),
    index('whatsapp_templates_store_id_status_idx').on(table.storeId, table.status),
    check('whatsapp_templates_category', isOneOf(table.category, messageCategories)),
    check('whatsapp_templates_status', isOneOf(table.status, templateStatuses)),
  ],
);

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
    goal: text('goal'),
    channel: text('channel', { enum: campaignChannels }).notNull(),
    category: text('category', { enum: messageCategories }).notNull().default('marketing'),
    whatsappTemplateId: uuid('whatsapp_template_id').references(() => whatsappTemplates.id),
    content: jsonb('content').notNull(),
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
    isAiWritten: boolean('is_ai_written').notNull().default(false),
    scheduledFor: timestamptz('scheduled_for'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamptz('approved_at'),
    startedAt: timestamptz('started_at'),
    finishedAt: timestamptz('finished_at'),
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
    index('campaigns_store_id_status_idx').on(table.storeId, table.status, table.createdAt),
    index('campaigns_due_idx')
      .on(table.scheduledFor)
      .where(sql`${table.status} = 'scheduled'`),
    index('campaigns_whatsapp_template_id_idx').on(table.whatsappTemplateId),
    index('campaigns_approved_by_user_id_idx').on(table.approvedByUserId),
    index('campaigns_created_by_user_id_idx').on(table.createdByUserId),
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
// The sender picks up rows still queued, so a restart never sends twice.
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
    // Phone or page-scoped id at freeze time.
    address: text('address'),
    status: text('status', { enum: recipientStatuses }).notNull(),
    skipReason: text('skip_reason', { enum: recipientSkipReasons }),
    providerMessageId: text('provider_message_id'),
    costPoisha: poisha('cost_poisha'),
    errorCode: text('error_code'),
    sentAt: timestamptz('sent_at'),
    deliveredAt: timestamptz('delivered_at'),
    readAt: timestamptz('read_at'),
    tappedAt: timestamptz('tapped_at'),
    failedAt: timestamptz('failed_at'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('campaign_recipients_campaign_contact_key').on(table.campaignId, table.contactId),
    index('campaign_recipients_campaign_status_idx').on(table.campaignId, table.status),
    // Frequency cap and last-touch attribution look up a contact's recent sends.
    index('campaign_recipients_store_contact_idx').on(table.storeId, table.contactId, table.sentAt),
    // Global, for SMS delivery reports that carry only the provider's message id.
    index('campaign_recipients_provider_message_idx')
      .on(table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
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
