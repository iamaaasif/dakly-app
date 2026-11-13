import { sql } from 'drizzle-orm';
import { check, date, index, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { customerInsightKinds, customerInsightSources } from '@dakly/contracts/contacts';
import { users } from './auth';
import { createdAt, id, isOneOf, timestamptz } from './columns';
import { stores } from './stores';

// Customer insights cards (feature 03), rebuilt nightly from orders. One row per insight and
// source filter; the rebuild replaces the numbers and text but keeps a "Not useful" hide.
export const customerInsights = pgTable(
  'customer_insights',
  {
    id: id(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    kind: text('kind', { enum: customerInsightKinds }).notNull(),
    source: text('source', { enum: customerInsightSources }).notNull().default('all'),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    // The fixed calculation's output; the chart and the sentences read only these numbers.
    figures: jsonb('figures').notNull(),
    factText: text('fact_text'),
    tipText: text('tip_text'),
    aiRunId: uuid('ai_run_id'),
    hiddenAt: timestamptz('hidden_at'),
    hiddenByUserId: uuid('hidden_by_user_id').references(() => users.id),
    builtAt: timestamptz('built_at').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('customer_insights_store_id_kind_source_key').on(
      table.storeId,
      table.kind,
      table.source,
    ),
    index('customer_insights_hidden_by_user_id_idx').on(table.hiddenByUserId),
    check('customer_insights_kind', isOneOf(table.kind, customerInsightKinds)),
    check('customer_insights_source', isOneOf(table.source, customerInsightSources)),
    check('customer_insights_period', sql`${table.periodStart} <= ${table.periodEnd}`),
    check(
      'customer_insights_hidden',
      sql`(${table.hiddenAt} is null) = (${table.hiddenByUserId} is null)`,
    ),
  ],
);
