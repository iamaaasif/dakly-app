import { sql } from 'drizzle-orm';
import {
  foreignKey,
  type PgTableExtraConfigValue,
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
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import {
  automationRunStatuses,
  automationStatuses,
  automationStepKinds,
} from '@dakly/contracts/automations';
import { recipientSkipReasons } from '@dakly/contracts/campaigns';
import { users } from './auth';
import { createdAt, id, isOneOf, poisha, timestamptz, updatedAt } from './columns';
import { contacts } from './contacts';
import { stores } from './stores';

// A workflow (D23). The draft graph is edited freely; Publish copies it into an immutable version.
export const automations = pgTable(
  'automations',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    templateKey: text('template_key'),
    triggerType: text('trigger_type').notNull(),
    status: text('status', { enum: automationStatuses }).notNull().default('draft'),
    // AUTO-R2: transactional first, then priority, when two automations hit one person on a day.
    isTransactional: boolean('is_transactional').notNull().default(false),
    priority: smallint('priority').notNull().default(0),
    draftGraph: jsonb('draft_graph').notNull(),
    publishedVersionId: uuid('published_version_id').references(
      (): AnyPgColumn => automationVersions.id,
    ),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('automations_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'automations_published_version_id_store_fk',
      columns: [table.storeId, table.publishedVersionId],
      foreignColumns: [automationVersions.storeId, automationVersions.id] as [
        AnyPgColumn,
        AnyPgColumn,
      ],
    }),

    index('automations_store_id_trigger_idx').on(table.storeId, table.triggerType, table.status),
    index('automations_published_version_id_idx').on(table.publishedVersionId),
    index('automations_created_by_user_id_idx').on(table.createdByUserId),
    check('automations_status', isOneOf(table.status, automationStatuses)),
  ],
);

// Published graph and metadata are immutable; only is_stopped is mutable. Runs keep their version.
export const automationVersions = pgTable(
  'automation_versions',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    automationId: uuid('automation_id')
      .notNull()
      .references((): AnyPgColumn => automations.id),
    version: integer('version').notNull(),
    graph: jsonb('graph').notNull(),
    // "Stop the old version": runs on it exit at their next step.
    isStopped: boolean('is_stopped').notNull().default(false),
    publishedByUserId: uuid('published_by_user_id').references(() => users.id),
    publishedAt: timestamptz('published_at').notNull().defaultNow(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('automation_versions_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'automation_versions_automation_id_store_fk',
      columns: [table.storeId, table.automationId],
      foreignColumns: [automations.storeId, automations.id] as [AnyPgColumn, AnyPgColumn],
    }),

    uniqueIndex('automation_versions_automation_version_key').on(table.automationId, table.version),
    index('automation_versions_store_id_idx').on(table.storeId),
    index('automation_versions_published_by_user_id_idx').on(table.publishedByUserId),
  ],
);

// One person's trip through one version. Postgres is the source of truth for waiting runs: a
// sweeper claims due rows every minute through due_automation_runs() and queues one job per step.
export const automationRuns = pgTable(
  'automation_runs',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    automationId: uuid('automation_id')
      .notNull()
      .references(() => automations.id),
    versionId: uuid('version_id')
      .notNull()
      .references(() => automationVersions.id),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    // The event that started it (for example the order id), so a twice-delivered event runs once.
    triggerKey: text('trigger_key').notNull(),
    currentStepKey: text('current_step_key').notNull(),
    status: text('status', { enum: automationRunStatuses }).notNull().default('waiting'),
    exitReason: text('exit_reason'),
    wakeAt: timestamptz('wake_at'),
    claimedAt: timestamptz('claimed_at'),
    attempts: smallint('attempts').notNull().default(0),
    lastError: text('last_error'),
    enteredAt: timestamptz('entered_at').notNull().defaultNow(),
    finishedAt: timestamptz('finished_at'),
    updatedAt: updatedAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('automation_runs_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'automation_runs_automation_id_store_fk',
      columns: [table.storeId, table.automationId],
      foreignColumns: [automations.storeId, automations.id] as [AnyPgColumn, AnyPgColumn],
    }),
    foreignKey({
      name: 'automation_runs_version_id_store_fk',
      columns: [table.storeId, table.versionId],
      foreignColumns: [automationVersions.storeId, automationVersions.id] as [
        AnyPgColumn,
        AnyPgColumn,
      ],
    }),
    foreignKey({
      name: 'automation_runs_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),

    uniqueIndex('automation_runs_trigger_key').on(
      table.automationId,
      table.contactId,
      table.triggerKey,
    ),
    index('automation_runs_due_idx')
      .on(table.wakeAt)
      .where(sql`${table.status} = 'waiting'`),
    index('automation_runs_stale_claim_idx')
      .on(table.claimedAt)
      .where(sql`${table.status} = 'running'`),
    index('automation_runs_store_automation_idx').on(
      table.storeId,
      table.automationId,
      table.status,
    ),
    index('automation_runs_store_contact_idx').on(table.storeId, table.contactId),
    index('automation_runs_version_id_idx').on(table.versionId),
    index('automation_runs_contact_id_idx').on(table.contactId),
    check('automation_runs_status', isOneOf(table.status, automationRunStatuses)),
    check(
      'automation_runs_waiting_has_wake',
      sql`${table.status} <> 'waiting' or ${table.wakeAt} is not null`,
    ),
  ],
);

// One row per executed step, kept through 372 days after the run finishes, for history and
// last-touch attribution of automation sends.
export const automationRunSteps = pgTable(
  'automation_run_steps',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    runId: uuid('run_id')
      .notNull()
      .references(() => automationRuns.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    stepKey: text('step_key').notNull(),
    kind: text('kind', { enum: automationStepKinds }).notNull(),
    outcome: text('outcome').notNull(),
    channel: text('channel'),
    skipReason: text('skip_reason', { enum: recipientSkipReasons }),
    providerMessageId: text('provider_message_id'),
    costPoisha: poisha('cost_poisha'),
    sentAt: timestamptz('sent_at'),
    deliveredAt: timestamptz('delivered_at'),
    readAt: timestamptz('read_at'),
    tappedAt: timestamptz('tapped_at'),
    createdAt: createdAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      name: 'automation_run_steps_run_id_store_fk',
      columns: [table.storeId, table.runId],
      foreignColumns: [automationRuns.storeId, automationRuns.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),
    foreignKey({
      name: 'automation_run_steps_contact_id_store_fk',
      columns: [table.storeId, table.contactId],
      foreignColumns: [contacts.storeId, contacts.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),

    uniqueIndex('automation_run_steps_run_step_key').on(table.runId, table.stepKey),
    index('automation_run_steps_store_contact_idx').on(
      table.storeId,
      table.contactId,
      table.sentAt,
    ),
    // Global, for SMS delivery reports that carry only the provider's message id.
    index('automation_run_steps_provider_message_idx')
      .on(table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    index('automation_run_steps_contact_id_idx').on(table.contactId),
    index('automation_run_steps_created_at_idx').on(table.createdAt),
    check('automation_run_steps_kind', isOneOf(table.kind, automationStepKinds)),
    check('automation_run_steps_skip_reason', isOneOf(table.skipReason, recipientSkipReasons)),
  ],
);
