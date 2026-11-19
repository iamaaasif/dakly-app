import { Inject, Injectable } from '@nestjs/common';
import { and, eq, notInArray, sql } from 'drizzle-orm';

import { storeDailyMetrics } from '@dakly/db/schema/analytics';

import { TenantDatabase } from '../platform/database/tenant-database';

type Metric = { day: string; metric: string; dimension?: string; value: bigint };

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

  async hasOrderEvent(storeId: string, event: { id: string; occurredAt: string }) {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ dimension: storeDailyMetrics.dimension })
        .from(storeDailyMetrics)
        .where(
          and(
            eq(storeDailyMetrics.storeId, storeId),
            eq(storeDailyMetrics.day, event.occurredAt.slice(0, 10)),
            eq(storeDailyMetrics.metric, 'order_event'),
            eq(storeDailyMetrics.dimension, event.id),
          ),
        ),
    );
    return row !== undefined;
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
