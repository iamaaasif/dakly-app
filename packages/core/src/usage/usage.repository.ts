import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { UsageUnit, usageSources } from '@dakly/contracts/billing';
import type { Database } from '@dakly/db/client';
import { usageEvents } from '@dakly/db/schema/billing';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';

export type UsageEvent = {
  id: string;
  unit: UsageUnit;
  quantity: number;
  source: (typeof usageSources)[number];
  reference: string;
  periodStart: string;
};

const usageEventColumns = {
  id: usageEvents.id,
  unit: usageEvents.unit,
  quantity: usageEvents.quantity,
  source: usageEvents.source,
  reference: usageEvents.reference,
  periodStart: usageEvents.periodStart,
};

@Injectable()
export class UsageRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  // Held until the caller's store transaction ends, so the sum and the insert see no rival writer.
  async lockUnit(storeId: string, unit: UsageUnit): Promise<void> {
    await this.database.inTransaction(storeId, (tx) =>
      tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('usage:' || ${storeId} || ':' || ${unit}, 0))`,
      ),
    );
  }

  async findByReference(
    storeId: string,
    unit: UsageUnit,
    reference: string,
  ): Promise<UsageEvent | undefined> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(usageEventColumns)
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.storeId, storeId),
            eq(usageEvents.unit, unit),
            eq(usageEvents.reference, reference),
          ),
        )
        .limit(1),
    );
    return row;
  }

  async periodTotal(storeId: string, unit: UsageUnit, periodStart: string): Promise<number> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ total: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)`.mapWith(Number) })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.storeId, storeId),
            eq(usageEvents.unit, unit),
            eq(usageEvents.periodStart, periodStart),
          ),
        ),
    );
    return row?.total ?? 0;
  }

  async insert(storeId: string, event: Omit<UsageEvent, 'id'>): Promise<UsageEvent> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .insert(usageEvents)
        .values({ storeId, ...event })
        .returning(usageEventColumns),
    );
    return row!;
  }

  // Usage rows span every store and the app role cannot delete them, so a SQL function removes
  // events whose period started over 13 months ago. Returns the rows deleted.
  async purgeExpiredBatch(limit: number): Promise<number> {
    const { rows } = await this.global.execute<{ deleted: number }>(
      sql`select public.purge_expired_usage_events(${limit}) as deleted`,
    );
    return rows[0]?.deleted ?? 0;
  }
}
