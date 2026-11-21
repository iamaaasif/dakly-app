import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, isNotNull, lte, ne, notInArray, sql } from 'drizzle-orm';

import { storeDailyMetrics } from '@dakly/db/schema/analytics';
import { contacts } from '@dakly/db/schema/contacts';
import { orders } from '@dakly/db/schema/orders';

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

  // Which of these buyers have a live order credited to the source.
  async attributedBuyerIds(
    storeId: string,
    source: { type: 'campaign' | 'automation'; id: string },
    contactIds: string[],
  ): Promise<string[]> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .selectDistinct({ contactId: orders.buyerContactId })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, storeId),
            eq(orders.attributedSourceType, source.type),
            eq(orders.attributedSourceId, source.id),
            ne(orders.stage, 'cancelled'),
            inArray(orders.buyerContactId, contactIds),
          ),
        ),
    );
    return rows.flatMap(({ contactId }) => (contactId ? [contactId] : []));
  }

  // Live orders credited to one source, one row per order, for the people behind a source's revenue.
  attributedOrders(
    storeId: string,
    source: { type: 'campaign' | 'automation'; id: string },
    { cursor, limit }: { cursor?: string; limit: number },
  ) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: orders.id,
          contactId: orders.buyerContactId,
          name: contacts.name,
          amountPoisha: orders.attributedAmountPoisha,
          placedAt: orders.createdAt,
        })
        .from(orders)
        .innerJoin(
          contacts,
          and(eq(contacts.storeId, storeId), eq(contacts.id, orders.buyerContactId)),
        )
        .where(
          and(
            eq(orders.storeId, storeId),
            eq(orders.attributedSourceType, source.type),
            eq(orders.attributedSourceId, source.id),
            ne(orders.stage, 'cancelled'),
            isNotNull(orders.buyerContactId),
            cursor ? gt(orders.id, cursor) : undefined,
          ),
        )
        .orderBy(asc(orders.id))
        .limit(limit + 1),
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

  readChannelRevenue(storeId: string, period: ReportPeriod) {
    return this.readMetrics(
      storeId,
      period,
      ['marketing_revenue'],
      sql`${storeDailyMetrics.dimension} like 'channel:%'`,
    );
  }

  readChannelOrders(storeId: string, period: ReportPeriod) {
    return this.readMetrics(
      storeId,
      period,
      ['marketing_orders'],
      sql`${storeDailyMetrics.dimension} like 'channel:%'`,
    );
  }

  // Read from the runs, not the daily totals, which only hold finished days.
  async aiCostMicroUsd(
    storeId: string,
    { from, through, timeZone }: ReportPeriod & { timeZone: string },
    purposes: readonly string[],
  ) {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ cost: string }>(sql`
        select coalesce(sum(cost_micro_usd), 0)::text as cost
        from ai_runs
        where store_id = ${storeId} and purpose in (${sql.join(
          purposes.map((purpose) => sql`${purpose}`),
          sql`, `,
        )})
          and created_at >= (${from}::date)::timestamp at time zone ${timeZone}
          and created_at < (${through}::date + 1)::timestamp at time zone ${timeZone}`),
    );
    return BigInt(rows[0]?.cost ?? '0');
  }

  // People delivered to and people who tapped, per channel, over campaign sends and workflow send steps.
  async channelPeople(
    storeId: string,
    { from, through, timeZone }: ReportPeriod & { timeZone: string },
  ) {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ channel: string; delivered: number; tapped: number }>(sql`
        select channel, (count(distinct contact_id) filter (where delivered))::int as delivered,
          (count(distinct contact_id) filter (where tapped))::int as tapped
        from (
          select c.channel, r.contact_id, coalesce(r.delivered_at, r.read_at) is not null as delivered,
            r.tapped_at is not null as tapped, r.sent_at
          from campaign_recipients r
          join campaigns c on c.store_id = r.store_id and c.id = r.campaign_id
          where r.store_id = ${storeId}
          union all
          select channel, contact_id, coalesce(delivered_at, read_at) is not null,
            tapped_at is not null, sent_at
          from automation_run_steps
          where store_id = ${storeId} and kind = 'send' and category = 'marketing'
            and channel is not null
        ) sends
        where sent_at >= (${from}::date)::timestamp at time zone ${timeZone}
          and sent_at < (${through}::date + 1)::timestamp at time zone ${timeZone}
        group by channel`),
    );
    return rows;
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

  // People, not messages: one person who tapped a campaign and a workflow link counts once.
  async messagePeople(
    storeId: string,
    { from, through, timeZone }: ReportPeriod & { timeZone: string },
  ) {
    const { rows } = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ delivered: number; tapped: number }>(sql`
        select (count(distinct contact_id) filter (where delivered))::int as delivered,
          (count(distinct contact_id) filter (where tapped))::int as tapped
        from (
          select contact_id, coalesce(delivered_at, read_at) is not null as delivered,
            tapped_at is not null as tapped, sent_at
          from campaign_recipients where store_id = ${storeId}
          union all
          select contact_id, coalesce(delivered_at, read_at) is not null,
            tapped_at is not null, sent_at
          from automation_run_steps
          where store_id = ${storeId} and kind = 'send' and category = 'marketing'
        ) sends
        where sent_at >= (${from}::date)::timestamp at time zone ${timeZone}
          and sent_at < (${through}::date + 1)::timestamp at time zone ${timeZone}`),
    );
    return rows[0] ?? { delivered: 0, tapped: 0 };
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
