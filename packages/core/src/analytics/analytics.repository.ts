import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, lte, notInArray, sql } from 'drizzle-orm';

import { storeDailyMetrics } from '@dakly/db/schema/analytics';

import { TenantDatabase } from '../platform/database/tenant-database';
import type { ReportPeriod } from './report-period';

type Metric = { day: string; metric: string; dimension?: string; value: bigint };

const BUYER_ACTIVITY = 'buyer_activity';

export const marketingMetrics = ['marketing_orders', 'marketing_revenue'] as const;

@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  readDailyMetrics(storeId: string, period: ReportPeriod, metrics: string[]) {
    return this.readMetrics(
      storeId,
      period,
      metrics,
      sql`(${storeDailyMetrics.dimension} = '' or ${storeDailyMetrics.metric} = 'sales')`,
    );
  }

  readAttributionMetrics(storeId: string, period: ReportPeriod, dimensions?: string[]) {
    return this.readMetrics(
      storeId,
      period,
      [...marketingMetrics],
      dimensions ? inArray(storeDailyMetrics.dimension, dimensions) : undefined,
    );
  }

  private readMetrics(
    storeId: string,
    period: ReportPeriod,
    metrics: string[],
    filter: ReturnType<typeof sql> | undefined,
  ) {
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
            filter,
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

  async oldestOrderSummaryDay(storeId: string, since: string) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ day: storeDailyMetrics.day })
        .from(storeDailyMetrics)
        .where(
          and(
            eq(storeDailyMetrics.storeId, storeId),
            inArray(storeDailyMetrics.metric, [
              'orders',
              'delivered_orders',
              'net_spend',
              'sales',
              ...marketingMetrics,
            ]),
            gte(storeDailyMetrics.day, since),
          ),
        )
        .orderBy(asc(storeDailyMetrics.day))
        .limit(1),
    );
    return row?.day;
  }

  async pruneExpiredRows(storeId: string, reportBefore: string) {
    const limit = 5000;
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ count: number }>(sql`
        with expired as (
          select ctid from store_daily_metrics
          where store_id = ${storeId} and day < ${reportBefore}::date
            and metric in ('orders', 'sales', 'delivered_orders', 'net_spend', 'buyer_activity', 'lifecycle', 'marketing_orders', 'marketing_revenue', 'ai_runs', 'ai_cost_micro_usd', 'ai_input_tokens', 'ai_output_tokens')
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

  // Dhaka has no daylight saving, so a Dhaka day is always the same 24 UTC hours.
  async rollUpAiRunDay(storeId: string, day: string) {
    await this.database.forStore(storeId, (tx) =>
      tx.execute(sql`
        insert into store_daily_metrics (store_id, day, metric, dimension, value)
        select ${storeId}::uuid, ${day}::date, m.metric, sums.purpose, m.value::bigint
        from (
          select purpose, count(*) as runs, sum(cost_micro_usd) as cost,
            sum(input_tokens) as input, sum(output_tokens) as output
          from ai_runs
          where store_id = ${storeId}
            and created_at >= (${day}::date::timestamp at time zone 'Asia/Dhaka')
            and created_at < ((${day}::date + 1)::timestamp at time zone 'Asia/Dhaka')
          group by purpose
        ) sums
        cross join lateral (values
          ('ai_runs', sums.runs), ('ai_cost_micro_usd', sums.cost),
          ('ai_input_tokens', sums.input), ('ai_output_tokens', sums.output)
        ) as m(metric, value)
        on conflict (store_id, day, metric, dimension) do update set value = excluded.value,
          updated_at = now()`),
    );
  }
}
