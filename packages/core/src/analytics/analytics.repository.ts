import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lte, notInArray, sql } from 'drizzle-orm';

import { storeDailyMetrics } from '@dakly/db/schema/analytics';

import { TenantDatabase } from '../platform/database/tenant-database';
import type { ReportPeriod } from './report-period';

type Metric = { day: string; metric: string; dimension?: string; value: bigint };

const BUYER_ACTIVITY = 'buyer_activity';

@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  readDailyMetrics(storeId: string, period: ReportPeriod, metrics: string[]) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          day: storeDailyMetrics.day,
          metric: storeDailyMetrics.metric,
          dimension: storeDailyMetrics.dimension,
          value: sql`${storeDailyMetrics.value}::text`.mapWith(BigInt),
        })
        .from(storeDailyMetrics)
        .where(
          and(
            eq(storeDailyMetrics.storeId, storeId),
            gte(storeDailyMetrics.day, period.from),
            lte(storeDailyMetrics.day, period.through),
            inArray(storeDailyMetrics.metric, metrics),
            sql`(${storeDailyMetrics.dimension} = '' or ${storeDailyMetrics.metric} = 'sales')`,
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
