import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, lt, sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';
import { webhookEvents } from '@dakly/db/schema/platform';

import { DATABASE } from '../platform/database/database.tokens';

const eventColumns = { id: webhookEvents.id, status: webhookEvents.status };

type RecoveryCursor = { id: string; receivedAt: string };

@Injectable()
export class MetaWebhooksRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  // A delivery may cover several stores. Its row is global until the worker routes it.
  async saveDelivery(externalId: string, payload: Record<string, unknown>, receivedAt: Date) {
    const [inserted] = await this.database
      .insert(webhookEvents)
      .values({ provider: 'meta', externalId, payload, receivedAt })
      .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.externalId] })
      .returning(eventColumns);
    if (inserted) return inserted;

    // Use a new statement so a duplicate can see a concurrent insert after it commits.
    const [existing] = await this.database
      .select(eventColumns)
      .from(webhookEvents)
      .where(and(eq(webhookEvents.provider, 'meta'), eq(webhookEvents.externalId, externalId)))
      .limit(1);
    return existing;
  }

  listReceivedBefore(before: Date, after?: RecoveryCursor) {
    return this.database
      .select({
        id: webhookEvents.id,
        // Keep Postgres timestamp precision when using the last row as a cursor.
        receivedAt: sql<string>`${webhookEvents.receivedAt}::text`,
      })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.provider, 'meta'),
          eq(webhookEvents.status, 'received'),
          lt(webhookEvents.receivedAt, before),
          after &&
            sql`(${webhookEvents.receivedAt}, ${webhookEvents.id}) >
            (${after.receivedAt}::timestamptz, ${after.id}::uuid)`,
        ),
      )
      .orderBy(asc(webhookEvents.receivedAt), asc(webhookEvents.id))
      .limit(100);
  }

  async purgeFinishedBefore(before: Date) {
    const result = await this.database.execute<{ deleted: number }>(
      sql`select public.purge_webhook_events(${before.toISOString()}::timestamptz) as deleted`,
    );
    return result.rows.some(({ deleted }) => deleted > 0);
  }

  async findReceived(id: string) {
    const [row] = await this.database
      .select({ payload: webhookEvents.payload, receivedAt: webhookEvents.receivedAt })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.id, id),
          eq(webhookEvents.provider, 'meta'),
          eq(webhookEvents.status, 'received'),
        ),
      );
    return row;
  }

  async findStoresForAccounts(accounts: { kind: string; externalAccountId: string }[]) {
    const result = await this.database.execute<{
      kind: string;
      externalAccountId: string;
      storeId: string | null;
    }>(sql`
      select kind, account_id as "externalAccountId", store_id_for_channel_account(kind, account_id) as "storeId"
      from unnest(${sql.param(accounts.map((account) => account.externalAccountId))}::text[],
        ${sql.param(accounts.map((account) => account.kind))}::text[])
        as accounts(account_id, kind)
    `);
    return result.rows;
  }

  async finish(
    id: string,
    result: {
      status: 'processed' | 'ignored' | 'failed';
      error: string | null;
      processedAt: Date;
      payload?: null;
    },
  ) {
    await this.database
      .update(webhookEvents)
      .set(result)
      .where(
        and(
          eq(webhookEvents.id, id),
          eq(webhookEvents.provider, 'meta'),
          eq(webhookEvents.status, 'received'),
        ),
      );
  }
}
