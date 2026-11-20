import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';

export type Rollup = 'tracked_link_visit_days' | 'ai_run_daily_metrics';

const PARTITIONED_TABLES = ['audit_log', 'ai_runs', 'tracked_link_visits'];
const SOURCE_TABLE: Record<Rollup, string> = {
  tracked_link_visit_days: 'tracked_link_visits',
  ai_run_daily_metrics: 'ai_runs',
};

// Dhaka has no daylight saving, so a day is always the same 24 UTC hours.
const dayStart = (day: string) => sql`(${day}::date::timestamp at time zone 'Asia/Dhaka')`;
const dayEnd = (day: string) => sql`((${day}::date + 1)::timestamp at time zone 'Asia/Dhaka')`;

@Injectable()
export class MaintenanceRollupsRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
  ) {}

  async ensureMonthlyPartitions(monthsAhead: number) {
    await this.database.execute(sql`select ensure_monthly_partitions(${monthsAhead})`);
  }

  // The smallest count across the partitioned tables, because one table running out is enough
  // to make its writes fail.
  async futureMonthCount(): Promise<number> {
    const { rows } = await this.database.execute<{ months: number }>(sql`
      select coalesce(min(months), 0)::int as months from (
        select count(*) filter (
          where to_date(right(child.relname, 7), 'YYYY"m"MM') > date_trunc('month', now() at time zone 'UTC')
        ) as months
        from pg_catalog.pg_inherits h
        join pg_catalog.pg_class parent on parent.oid = h.inhparent
        join pg_catalog.pg_namespace n on n.oid = parent.relnamespace and n.nspname = 'public'
        join pg_catalog.pg_class child on child.oid = h.inhrelid
        where parent.relname in (${sql.join(
          PARTITIONED_TABLES.map((table) => sql`${table}`),
          sql`, `,
        )})
        group by parent.relname
      ) per_table`);
    return rows[0]?.months ?? 0;
  }

  async dropExpiredPartitions(): Promise<number> {
    const { rows } = await this.database.execute<{ dropped: number }>(
      sql`select drop_expired_partitions() as dropped`,
    );
    return rows[0]?.dropped ?? 0;
  }

  async watermark(rollup: Rollup): Promise<string | null> {
    const { rows } = await this.database.execute<{ day: string }>(
      sql`select completed_through::text as day from maintenance_watermarks where rollup = ${rollup}`,
    );
    return rows[0]?.day ?? null;
  }

  // First day of the oldest partition, so a first run covers rows written before it existed.
  async oldestPartitionDay(rollup: Rollup): Promise<string | null> {
    const { rows } = await this.database.execute<{ day: string | null }>(sql`
      select min(to_date(right(child.relname, 7), 'YYYY"m"MM'))::text as day
      from pg_catalog.pg_inherits h
      join pg_catalog.pg_class parent on parent.oid = h.inhparent
      join pg_catalog.pg_class child on child.oid = h.inhrelid
      where parent.relname = ${SOURCE_TABLE[rollup]} and child.relname ~ '_y[0-9]{4}m[0-9]{2}$'`);
    return rows[0]?.day ?? null;
  }

  // Compare-and-set, so a stale run that restarts after a newer one cannot move progress back.
  async advanceWatermark(rollup: Rollup, expected: string | null, day: string): Promise<boolean> {
    const { rows } =
      expected === null
        ? await this.database.execute(sql`
            insert into maintenance_watermarks (rollup, completed_through) values (${rollup}, ${day})
            on conflict (rollup) do nothing returning rollup`)
        : await this.database.execute(sql`
            update maintenance_watermarks set completed_through = ${day}, updated_at = now()
            where rollup = ${rollup} and completed_through = ${expected} returning rollup`);
    return rows.length > 0;
  }

  rollUpLinkVisits(storeId: string, day: string) {
    return this.tenant.forStore(storeId, (tx) =>
      tx.execute(sql`
        insert into tracked_link_visit_days
          (store_id, tracked_link_id, day, visits, unique_visitors, first_at, last_at)
        select store_id, tracked_link_id, ${day}::date, count(*), count(distinct visitor_hash),
          min(occurred_at), max(occurred_at)
        from tracked_link_visits
        where store_id = ${storeId} and occurred_at >= ${dayStart(day)} and occurred_at < ${dayEnd(day)}
        group by store_id, tracked_link_id
        on conflict (tracked_link_id, day) do update set visits = excluded.visits,
          unique_visitors = excluded.unique_visitors, first_at = excluded.first_at,
          last_at = excluded.last_at`),
    );
  }

  rollUpAiRuns(storeId: string, day: string) {
    return this.tenant.forStore(storeId, (tx) =>
      tx.execute(sql`
        insert into store_daily_metrics (store_id, day, metric, dimension, value)
        select ${storeId}::uuid, ${day}::date, m.metric, sums.purpose, m.value::bigint
        from (
          select purpose, count(*) as runs, sum(cost_micro_usd) as cost,
            sum(input_tokens) as input, sum(output_tokens) as output
          from ai_runs
          where store_id = ${storeId} and created_at >= ${dayStart(day)} and created_at < ${dayEnd(day)}
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
