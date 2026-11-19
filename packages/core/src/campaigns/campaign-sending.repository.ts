import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';
import { campaigns } from '@dakly/db/schema/campaigns';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';

const CAMPAIGNS_PER_STORE = 100;

@Injectable()
export class CampaignSendingRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  // Only the due store IDs cross RLS. The update below runs in the tenant transaction.
  async listDueStores(asOf: Date, after: string | null, limit: number): Promise<string[]> {
    const result = await this.global.execute<{ storeId: string }>(sql`
      select store_id as "storeId" from campaign_due_stores(${asOf.toISOString()}::timestamptz,
        ${after}::uuid, ${limit}::integer)
    `);
    return result.rows.map(({ storeId }) => storeId);
  }

  async startDueInStore(storeId: string, now: Date): Promise<void> {
    const eligible = and(
      eq(campaigns.storeId, storeId),
      sql`${campaigns.status} = 'scheduled'`,
      lte(campaigns.scheduledFor, now),
    );
    await this.database.forStore(storeId, async (tx) => {
      // Select the bounded batch once. A lock held by an edit or cancellation skips that row.
      const due = tx
        .$with('due_campaigns_to_start')
        .as(
          tx
            .select({ id: campaigns.id })
            .from(campaigns)
            .where(eligible)
            .orderBy(asc(campaigns.scheduledFor), asc(campaigns.id))
            .limit(CAMPAIGNS_PER_STORE)
            .for('update', { skipLocked: true }),
        );
      await tx
        .with(due)
        .update(campaigns)
        .set({ status: 'sending', startedAt: now, updatedAt: now })
        .where(and(eligible, inArray(campaigns.id, tx.select({ id: due.id }).from(due))));
    });
  }
}
