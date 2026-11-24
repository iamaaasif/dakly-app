import { sql } from 'drizzle-orm';
import {
  foreignKey,
  type PgTableExtraConfigValue,
  bigint,
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
  vector,
  type AnyPgColumn,
  primaryKey,
} from 'drizzle-orm/pg-core';

import {
  aiRunOutcomes,
  aiRunPurposes,
  aiTiers,
  assistantRoles,
  knowledgeKinds,
  knowledgeStatuses,
  replyLanguages,
  aiRuleChangeSources,
  aiRuleTargets,
} from '@dakly/contracts/ai';

import { uuidv7 } from '../uuid-v7';
import { users } from './auth';
import { createdAt, id, isOneOf, poisha, updatedAt } from './columns';
import { files } from './platform';
import { stores } from './stores';

// One row per store. Switches, hand-over rules, testers and test questions are jsonb validated
// by the contracts schema. version guards concurrent saves; undo history is ai_rule_changes.
export const aiAgentSettings = pgTable(
  'ai_agent_settings',
  {
    storeId: uuid('store_id')
      .primaryKey()
      .references(() => stores.id),
    isAutoReplyOn: boolean('is_auto_reply_on').notNull().default(false),
    replyLanguage: text('reply_language', { enum: replyLanguages })
      .notNull()
      .default('match_customer'),
    abilities: jsonb('abilities').notNull().default({}),
    handoverRules: jsonb('handover_rules').notNull().default({}),
    debounceSeconds: smallint('debounce_seconds').notNull().default(3),
    claimTimeoutMinutes: smallint('claim_timeout_minutes').default(10),
    returnToAiMinutes: integer('return_to_ai_minutes').default(30),
    extraRules: text('extra_rules'),
    testers: jsonb('testers').notNull().default([]),
    testQuestions: jsonb('test_questions').notNull().default([]),
    dailyCostCeilingPoisha: poisha('daily_cost_ceiling_poisha'),
    version: integer('version').notNull().default(1),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id),
    updatedAt: updatedAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    index('ai_agent_settings_updated_by_user_id_idx').on(table.updatedByUserId),
    check('ai_agent_settings_reply_language', isOneOf(table.replyLanguage, replyLanguages)),
    check('ai_agent_settings_debounce_seconds', sql`${table.debounceSeconds} between 0 and 20`),
  ],
);

// FAQs, policies, taught answers, files and links the AI answers from.
export const knowledgeItems = pgTable(
  'knowledge_items',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    kind: text('kind', { enum: knowledgeKinds }).notNull(),
    question: text('question'),
    answer: text('answer'),
    keywords: text('keywords')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    fileId: uuid('file_id').references(() => files.id),
    sourceUrl: text('source_url'),
    status: text('status', { enum: knowledgeStatuses }).notNull().default('active'),
    factsCount: integer('facts_count').notNull().default(0),
    timesUsed: integer('times_used').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('knowledge_items_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'knowledge_items_file_id_store_fk',
      columns: [table.storeId, table.fileId],
      foreignColumns: [files.storeId, files.id] as [AnyPgColumn, AnyPgColumn],
    }),

    index('knowledge_items_store_id_status_idx').on(table.storeId, table.status),
    index('knowledge_items_file_id_idx').on(table.fileId),
    index('knowledge_items_created_by_user_id_idx').on(table.createdByUserId),
    check('knowledge_items_kind', isOneOf(table.kind, knowledgeKinds)),
    check('knowledge_items_status', isOneOf(table.status, knowledgeStatuses)),
  ],
);

// Embedded passages of knowledge items. Searched by exact scan within one store; add an HNSW
// index only when a store passes about 20,000 chunks.
export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    knowledgeItemId: uuid('knowledge_item_id')
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 512 }).notNull(),
    // Search compares only chunks built by the configured model; a model change re-embeds.
    embeddingModel: text('embedding_model').notNull(),
    tokenCount: integer('token_count').notNull(),
    createdAt: createdAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    foreignKey({
      name: 'knowledge_chunks_knowledge_item_id_store_fk',
      columns: [table.storeId, table.knowledgeItemId],
      foreignColumns: [knowledgeItems.storeId, knowledgeItems.id] as [AnyPgColumn, AnyPgColumn],
    }).onDelete('cascade'),

    index('knowledge_chunks_store_id_idx').on(table.storeId),
    index('knowledge_chunks_knowledge_item_id_idx').on(table.knowledgeItemId),
  ],
);

// Append-only evidence for rule undo; the audit log holds the event timeline, not these snapshots.
// Every change a taught rule or a settings save makes to what the AI knows, with the values
// before and after, so the owner can undo one. Undo writes a new row (source 'undo') and is
// refused if the target changed again since, rather than overwriting a newer edit.
export const aiRuleChanges = pgTable(
  'ai_rule_changes',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    source: text('source', { enum: aiRuleChangeSources }).notNull(),
    target: text('target', { enum: aiRuleTargets }).notNull(),
    // Row id for a delivery zone or knowledge item; null for the store-wide settings rows.
    targetId: uuid('target_id'),
    // Only the fields this change touched.
    before: jsonb('before').notNull(),
    after: jsonb('after').notNull(),
    summary: text('summary').notNull(),
    undoesChangeId: uuid('undoes_change_id').references((): AnyPgColumn => aiRuleChanges.id),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('ai_rule_changes_store_id_id_key').on(table.storeId, table.id),
    foreignKey({
      name: 'ai_rule_changes_undoes_change_id_store_fk',
      columns: [table.storeId, table.undoesChangeId],
      foreignColumns: [aiRuleChanges.storeId, aiRuleChanges.id] as [AnyPgColumn, AnyPgColumn],
    }),

    index('ai_rule_changes_store_id_created_at_idx').on(table.storeId, table.createdAt),
    uniqueIndex('ai_rule_changes_undoes_change_id_key').on(table.undoesChangeId),
    index('ai_rule_changes_changed_by_user_id_idx').on(table.changedByUserId),
    check('ai_rule_changes_source', isOneOf(table.source, aiRuleChangeSources)),
    check('ai_rule_changes_target', isOneOf(table.target, aiRuleTargets)),
    check(
      'ai_rule_changes_undo_link',
      sql`(${table.source} = 'undo') = (${table.undoesChangeId} is not null)`,
    ),
  ],
);

// One row per model call: cost, tier, model and outcome. No prompt or reply text is stored here
// (rules/logging.md); the reply text is on the message and its sources on messages.ai_sources.
export const aiRuns = pgTable(
  'ai_runs',
  {
    // Partitioned by month on created_at, so the key includes it (docs/data/growth.md).
    id: uuid('id').notNull().$defaultFn(uuidv7),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    purpose: text('purpose', { enum: aiRunPurposes }).notNull(),
    tier: text('tier', { enum: aiTiers }).notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    // What the run was for (conversation, post, segment); not a foreign key, it spans features.
    subjectType: text('subject_type'),
    subjectId: uuid('subject_id'),
    inputTokens: integer('input_tokens').notNull().default(0),
    cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    // Vendor cost in millionths of a US dollar, so it stays an integer.
    costMicroUsd: bigint('cost_micro_usd', { mode: 'number' }).notNull().default(0),
    // The same cost in poisha at the rate in force when the run was saved, so a later rate change never moves history.
    costPoisha: poisha('cost_poisha').notNull().default(0),
    toolCalls: jsonb('tool_calls'),
    outcome: text('outcome', { enum: aiRunOutcomes }).notNull(),
    errorCode: text('error_code'),
    latencyMs: integer('latency_ms'),
    createdAt: createdAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'ai_runs_pkey', columns: [table.id, table.createdAt] }),
    index('ai_runs_store_id_created_at_idx').on(table.storeId, table.createdAt),
    index('ai_runs_subject_idx').on(table.storeId, table.subjectType, table.subjectId),
    check('ai_runs_purpose', isOneOf(table.purpose, aiRunPurposes)),
    check('ai_runs_tier', isOneOf(table.tier, aiTiers)),
    check('ai_runs_outcome', isOneOf(table.outcome, aiRunOutcomes)),
  ],
);

// Ask Dakly AI history, private to one user and kept 90 days (AI-R6).
export const assistantMessages = pgTable(
  'assistant_messages',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').notNull(),
    role: text('role', { enum: assistantRoles }).notNull(),
    content: text('content').notNull(),
    dataUsed: jsonb('data_used'),
    // Plain reference: ai_runs is partitioned by month and expires (docs/data/growth.md).
    aiRunId: uuid('ai_run_id'),
    createdAt: createdAt(),
  },
  (table): PgTableExtraConfigValue[] => [
    index('assistant_messages_thread_idx').on(
      table.storeId,
      table.userId,
      table.threadId,
      table.createdAt,
    ),
    index('assistant_messages_user_id_idx').on(table.userId),
    index('assistant_messages_created_at_idx').on(table.createdAt),
    check('assistant_messages_role', isOneOf(table.role, assistantRoles)),
  ],
);
