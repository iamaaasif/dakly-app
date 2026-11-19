import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, lt, lte, notInArray, sql } from 'drizzle-orm';

import { storeDailyMetrics } from '@dakly/db/schema/analytics';

import { TenantDatabase } from '../platform/database/tenant-database';
import type { ReportPeriod } from './report-period';

type Metric = { day: string; metric: string; dimension?: string; value: bigint };

const BUYER_ACTIVITY = 'buyer_activity';

@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  readDailyMetric(storeId: string, period: ReportPeriod, metric: string) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          day: storeDailyMetrics.day,
          value: sql`${storeDailyMetrics.value}::text`.mapWith(BigInt),
        })
        .from(storeDailyMetrics)
        .where(
          and(
            eq(storeDailyMetrics.storeId, storeId),
            gte(storeDailyMetrics.day, period.from),
            lte(storeDailyMetrics.day, period.through),
            eq(storeDailyMetrics.metric, metric),
            eq(storeDailyMetrics.dimension, ''),
          ),
        ),
    );
  }

  async readBuyers(storeId: string, period: ReportPeriod, kind: 'new' | 'returning') {
    const firstDay =
      kind === 'new'
        ? sql`value = day - date '1970-01-01'`
        : sql`value < ${period.from}::date - date '1970-01-01'`;
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ day: string | null; value: string }>(sql`
        select day::text, count(distinct dimension)::text as value
        from store_daily_metrics
        where store_id = ${storeId} and day between ${period.from}::date and ${period.through}::date
          and metric = ${BUYER_ACTIVITY} and ${firstDay}
        group by grouping sets ((day), ())
      `),
    );
    return rows;
  }

  async reportedBuyerIds(storeId: string, after: string | null, limit: number) {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .selectDistinct({ id: storeDailyMetrics.dimension })
        .from(storeDailyMetrics)
        .where(
          and(
            eq(storeDailyMetrics.storeId, storeId),
            eq(storeDailyMetrics.metric, BUYER_ACTIVITY),
            after ? gt(storeDailyMetrics.dimension, after) : undefined,
          ),
        )
        .orderBy(asc(storeDailyMetrics.dimension))
        .limit(limit),
    );
    return rows.map(({ id }) => id);
  }

  async oldestOrderSummaryDay(storeId: string, through: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ day: storeDailyMetrics.day })
        .from(storeDailyMetrics)
        .where(
          and(
            eq(storeDailyMetrics.storeId, storeId),
            eq(storeDailyMetrics.metric, 'orders'),
            sql`${storeDailyMetrics.day} >= (${through}::date - interval '24 months')::date`,
          ),
        )
        .orderBy(asc(storeDailyMetrics.day))
        .limit(1),
    );
    return row?.day;
  }

  async pruneEventMarkers(storeId: string, before: string) {
    await this.database.forStore(storeId, (tx) =>
      tx
        .delete(storeDailyMetrics)
        .where(
          and(
            eq(storeDailyMetrics.storeId, storeId),
            eq(storeDailyMetrics.metric, 'order_event'),
            lt(storeDailyMetrics.day, before),
          ),
        ),
    );
  }

  async readLifecycle(storeId: string, period: ReportPeriod) {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ dimension: string; value: string }>(sql`
        select dimension, value::text
        from store_daily_metrics
        where store_id = ${storeId} and metric = 'lifecycle' and day = (
          select max(day)
          from store_daily_metrics
          where store_id = ${storeId} and metric = 'lifecycle'
            and day between ${period.from}::date and ${period.through}::date
        )
      `),
    );
    return rows;
  }

  async lockSummaries(storeId: string) {
    // Subscriptions and repairs must read after the last summary write commits.
    await this.database.inTransaction(storeId, (tx) =>
      tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`analytics-${storeId}`}, 0))`),
    );
  }

  async recordEvent(storeId: string, event: { id: string; occurredAt: string }, now: Date) {
    const [row] = await this.database.inTransaction(storeId, (tx) =>
      tx
        .insert(storeDailyMetrics)
        .values({
          storeId,
          day: event.occurredAt.slice(0, 10),
          metric: 'order_event',
          dimension: event.id,
          value: 1,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ dimension: storeDailyMetrics.dimension }),
    );
    return row !== undefined;
  }

  async replaceBuyerActivity(
    storeId: string,
    contactId: string,
    days: { day: string; firstDay: number }[],
    now: Date,
  ) {
    await this.database.forStore(storeId, (tx) =>
      tx.delete(storeDailyMetrics).where(
        and(
          eq(storeDailyMetrics.storeId, storeId),
          eq(storeDailyMetrics.metric, BUYER_ACTIVITY),
          eq(storeDailyMetrics.dimension, contactId),
          days.length
            ? notInArray(
                storeDailyMetrics.day,
                days.map(({ day }) => day),
              )
            : undefined,
        ),
      ),
    );
    if (days.length) {
      await this.save(
        storeId,
        days.map(({ day, firstDay }) => ({
          day,
          metric: BUYER_ACTIVITY,
          dimension: contactId,
          value: BigInt(firstDay),
        })),
        now,
      );
    }
  }

  async save(storeId: string, metrics: Metric[], updatedAt: Date) {
    await this.database.forStore(storeId, (tx) =>
      tx
        .insert(storeDailyMetrics)
        .values(
          metrics.map(({ day, metric, dimension, value }) => ({
            storeId,
            day,
            metric,
            dimension,
            value: sql`${value.toString()}::bigint`,
            updatedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [
            storeDailyMetrics.storeId,
            storeDailyMetrics.day,
            storeDailyMetrics.metric,
            storeDailyMetrics.dimension,
          ],
          set: { value: sql`excluded.value`, updatedAt },
          setWhere: sql`${eq(storeDailyMetrics.storeId, storeId)}
          and ${storeDailyMetrics.value} is distinct from excluded.value`,
        }),
    );
  }
}
