import { Inject, Injectable } from '@nestjs/common';
import { and, eq, notInArray, sql } from 'drizzle-orm';

import { storeDailyMetrics } from '@dakly/db/schema/analytics';

import { TenantDatabase } from '../platform/database/tenant-database';

type Metric = { day: string; metric: string; dimension?: string; value: bigint };

const BUYER_ACTIVITY = 'buyer_activity';

@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async reportedBuyerIds(storeId: string, after: string | null, limit: number) {
    const cursor = after ? sql`and dimension > ${after}` : sql``;
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ id: string }>(sql`
        select distinct dimension as id from store_daily_metrics
        where store_id = ${storeId} and metric = ${BUYER_ACTIVITY} ${cursor}
        order by dimension limit ${limit}
      `),
    );
    return rows.map(({ id }) => id);
  }

  async oldestOrderSummaryDay(storeId: string, since: string) {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ day: string }>(sql`
        select day::text from store_daily_metrics
        where store_id = ${storeId} and day >= ${since}::date
          and metric in ('orders', 'delivered_orders', 'net_spend', 'sales')
        order by day limit 1
      `),
    );
    return rows[0]?.day;
  }

  async pruneExpiredRows(storeId: string, reportBefore: string) {
    const limit = 5000;
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ count: number }>(sql`
        with expired as (
          select ctid from store_daily_metrics
          where store_id = ${storeId} and day < ${reportBefore}::date
            and metric in ('orders', 'sales', 'delivered_orders', 'net_spend', 'buyer_activity', 'lifecycle')
          order by day, metric, dimension limit ${limit} for update
        ), removed as (
          delete from store_daily_metrics as metrics using expired
          where metrics.store_id = ${storeId} and metrics.ctid = expired.ctid
          returning 1
        )
        select count(*)::int from removed
      `),
    );
    return rows[0]?.count === limit;
  }

  async lockSummaries(storeId: string, scope: string) {
    // A repair and an event for the same rows must read in write order.
    await this.database.inTransaction(storeId, (tx) =>
      tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`analytics-${storeId}-${scope}`}, 0))`,
      ),
    );
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
          notInArray(
            storeDailyMetrics.day,
            days.map(({ day }) => day),
          ),
        ),
      ),
    );
    const metrics = days.map(({ day, firstDay }) => ({
      day,
      metric: BUYER_ACTIVITY,
      dimension: contactId,
      value: BigInt(firstDay),
    }));
    if (metrics.length) await this.save(storeId, metrics, now);
  }

  async save(storeId: string, metrics: Metric[], updatedAt: Date) {
    await this.database.forStore(storeId, (tx) =>
      tx
        .insert(storeDailyMetrics)
        .values(
          metrics.map(({ value, ...metric }) => ({
            storeId,
            ...metric,
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
