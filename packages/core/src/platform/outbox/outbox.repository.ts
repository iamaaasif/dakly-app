import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';
import { outboxEvents } from '@dakly/db/schema/platform';

import { DATABASE } from '../database/database.tokens';
import { TenantDatabase } from '../database/tenant-database';

type NewOutboxEvent = { type: string; payload: unknown; occurredAt: Date };

type ClaimedOutboxEvent = {
  id: string;
  storeId: string;
  type: string;
  payload: unknown;
  occurredAt: string;
  attempts: number;
};

// The outbox is global: the app may only insert, and the relay reads and marks rows through
// SECURITY DEFINER functions.
@Injectable()
export class OutboxRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(TenantDatabase) private readonly tenant: TenantDatabase,
  ) {}

  async insert(storeId: string, events: NewOutboxEvent[]) {
    await this.tenant.inTransaction(storeId, (tx) =>
      // A birthday sweep can revisit a page after it has published that local day.
      tx
        .insert(outboxEvents)
        .values(events.map((event) => ({ storeId, ...event })))
        .onConflictDoNothing(),
    );
  }

  // One autocommit statement, so the claim's row locks end before the relay talks to Valkey.
  async claim(limit: number) {
    return (
      await this.database.execute<ClaimedOutboxEvent>(sql`
        select
          id,
          store_id as "storeId",
          type,
          payload,
          to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "occurredAt",
          attempts
        from claim_outbox_events(${limit})
        order by id`)
    ).rows;
  }

  async markPublished(ids: string[]) {
    await this.database.execute(
      sql`select mark_outbox_events_published(${sql.param(ids)}::uuid[])`,
    );
  }

  // The SQL function removes only events published over 7 days ago. Returns the rows deleted.
  async purgePublishedBatch(limit: number): Promise<number> {
    const { rows } = await this.database.execute<{ deleted: number }>(
      sql`select public.purge_published_outbox_batch(${limit}) as deleted`,
    );
    return rows[0]?.deleted ?? 0;
  }
}
