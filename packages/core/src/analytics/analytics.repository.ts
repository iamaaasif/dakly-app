import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lte, notInArray, sql } from 'drizzle-orm';

import { storeDailyMetrics } from '@dakly/db/schema/analytics';

import { TenantDatabase } from '../platform/database/tenant-database';
import type { ReportPeriod } from './report-period';

type Metric = { day: string; metric: string; dimension?: string; value: bigint };

type PendingOrderDay = { day: string; generation: string };

const ORDER_PENDING = 'order_refresh_pending';
const BUYER_ACTIVITY = 'buyer_activity';

@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async lockSummaries(storeId: string, scope: string) {
    // A repair and an event for the same rows must read in write order.
    await this.database.inTransaction(storeId, (tx) =>
      tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`analytics-${storeId}-${scope}`}, 0))`,
      ),
    );
  }

  markOrderDayPending(storeId: string, day: string, updatedAt: Date) {
    return this.database.inTransaction(storeId, (tx) =>
      tx
        .insert(storeDailyMetrics)
        .values({ storeId, day, metric: ORDER_PENDING, value: 1, updatedAt })
        .onConflictDoUpdate({
          target: [
            storeDailyMetrics.storeId,
            storeDailyMetrics.day,
            storeDailyMetrics.metric,
            storeDailyMetrics.dimension,
          ],
          set: { value: sql`${storeDailyMetrics.value} + 1`, updatedAt },
        }),
    );
  }

  pendingOrderDays(storeId: string, period: ReportPeriod) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          day: storeDailyMetrics.day,
          generation: sql<string>`${storeDailyMetrics.value}::text`,
        })
        .from(storeDailyMetrics)
        .where(
          and(
            eq(storeDailyMetrics.storeId, storeId),
            gte(storeDailyMetrics.day, period.from),
            lte(storeDailyMetrics.day, period.through),
            eq(storeDailyMetrics.metric, ORDER_PENDING),
          ),
        ),
    );
  }

  clearOrderDays(storeId: string, pending: PendingOrderDay[]) {
    const versions = sql.join(
      pending.map(({ day, generation }) => sql`(${day}::date, ${generation}::bigint)`),
      sql`, `,
    );
    return this.database.inTransaction(storeId, (tx) =>
      tx.execute(sql`delete from store_daily_metrics
        where store_id = ${storeId} and metric = ${ORDER_PENDING} and (day, value) in (${versions})`),
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
