import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';
import { metaPageSubscriptions } from '@dakly/db/schema/channels';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';

const subscriptionFields = {
  id: metaPageSubscriptions.id,
  pageExternalId: metaPageSubscriptions.pageExternalId,
  ciphertext: metaPageSubscriptions.accessTokenCiphertext,
  keyVersion: metaPageSubscriptions.keyVersion,
};

@Injectable()
export class MetaPageSubscriptionsRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly globalDatabase: Database,
  ) {}

  async save(
    storeId: string,
    input: { pageExternalId: string; ciphertext: Buffer; keyVersion: number; now: Date },
  ): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .insert(metaPageSubscriptions)
        .values({
          storeId,
          pageExternalId: input.pageExternalId,
          accessTokenCiphertext: input.ciphertext,
          keyVersion: input.keyVersion,
          createdAt: input.now,
        })
        .onConflictDoUpdate({
          target: [metaPageSubscriptions.storeId, metaPageSubscriptions.pageExternalId],
          set: {
            accessTokenCiphertext: input.ciphertext,
            keyVersion: input.keyVersion,
            createdAt: input.now,
          },
        }),
    );
  }

  async removePages(storeId: string, pageExternalIds: string[]): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .delete(metaPageSubscriptions)
        .where(
          and(
            eq(metaPageSubscriptions.storeId, storeId),
            inArray(metaPageSubscriptions.pageExternalId, pageExternalIds),
          ),
        ),
    );
  }

  async removeIfUnchanged(storeId: string, id: string, ciphertext: Buffer): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .delete(metaPageSubscriptions)
        .where(
          and(
            eq(metaPageSubscriptions.storeId, storeId),
            eq(metaPageSubscriptions.id, id),
            eq(metaPageSubscriptions.accessTokenCiphertext, ciphertext),
          ),
        ),
    );
  }

  async findPage(storeId: string, pageExternalId: string) {
    const [subscription] = await this.database.forStore(storeId, (tx) =>
      tx
        .select(subscriptionFields)
        .from(metaPageSubscriptions)
        .where(
          and(
            eq(metaPageSubscriptions.storeId, storeId),
            eq(metaPageSubscriptions.pageExternalId, pageExternalId),
          ),
        ),
    );
    return subscription;
  }

  listCreatedBefore(storeId: string, before: Date) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select(subscriptionFields)
        .from(metaPageSubscriptions)
        .where(
          and(
            eq(metaPageSubscriptions.storeId, storeId),
            lte(metaPageSubscriptions.createdAt, before),
          ),
        )
        .orderBy(metaPageSubscriptions.id),
    );
  }

  async isPageConnected(storeId: string, pageExternalId: string): Promise<boolean> {
    // Any store's connection counts: unsubscribing would stop its deliveries too.
    const result = await this.database.forStore(storeId, (tx) =>
      tx.execute<{ connected: boolean }>(
        sql`select store_id_for_channel_account('facebook_page', ${pageExternalId}) is not null as connected`,
      ),
    );
    return result.rows[0]?.connected ?? false;
  }

  async storesWithSubscriptionsCreatedBefore(before: Date, after: string | null) {
    const result = await this.globalDatabase.execute<{ storeId: string }>(sql`
      select store_id as "storeId"
      from meta_page_subscriptions_due(${before.toISOString()}::timestamptz, ${after}::uuid)
      order by store_id
    `);
    return result.rows;
  }
}
