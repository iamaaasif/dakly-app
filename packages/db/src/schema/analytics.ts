import { sql } from 'drizzle-orm';
import { bigint, date, index, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { updatedAt } from './columns';
import { stores } from './stores';

// Daily totals per store in store-local days, written by the analytics jobs so report pages
// never scan raw orders or messages. One row per (day, metric, dimension); the metric names are
// the glossary's, owned by analytics/ (ANA-1 fixes the list).
export const storeDailyMetrics = pgTable(
  'store_daily_metrics',
  {
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    day: date('day').notNull(),
    metric: text('metric').notNull(),
    // Channel, source or campaign id the number is split by; empty for the store total.
    dimension: text('dimension').notNull().default(''),
    value: bigint('value', { mode: 'number' }).notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({ columns: [table.storeId, table.day, table.metric, table.dimension] }),
    index('store_daily_metrics_buyer_activity_idx')
      .on(table.storeId, table.dimension, table.day)
      .where(sql`${table.metric} = 'buyer_activity'`),
  ],
);

// Company metrics for the admin panel (MRR and its movements, sign-ups, new paying shops, failed
// renewals, AI spend), one row per UTC day, metric and dimension. Written nightly by a definer
// function from subscriptions, invoices and ai_runs; the app role has no access.
export const platformDailyMetrics = pgTable(
  'platform_daily_metrics',
  {
    day: date('day').notNull(),
    metric: text('metric').notNull(),
    // Plan code, gateway or provider the number is split by; empty for the total.
    dimension: text('dimension').notNull().default(''),
    value: bigint('value', { mode: 'number' }).notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [primaryKey({ columns: [table.day, table.metric, table.dimension] })],
);
