import { bigint, date, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { stores } from './stores';
import { updatedAt } from './columns';

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
  (table) => [primaryKey({ columns: [table.storeId, table.day, table.metric, table.dimension] })],
);
