import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';
import { campaigns } from '@dakly/db/schema/campaigns';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';
import { statusWhere } from './campaigns.repository';

export type CampaignRef = { storeId: string; campaignId: string };

// The sender's reads and writes: the sweeps, the recipient claims and the settlement.
@Injectable()
export class CampaignSendingRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  // Only the due store ids cross RLS. Candidate rows are read in the tenant transaction below.
  async listDueStores(asOf: Date, after: string | null, limit: number): Promise<string[]> {
    const result = await this.global.execute<{ storeId: string }>(sql`
      select store_id as "storeId" from campaign_due_stores(${asOf.toISOString()}::timestamptz,
        ${after}::uuid, ${limit}::integer)
    `);
    return result.rows.map(({ storeId }) => storeId);
  }

  async listDueInStore(
    storeId: string,
    { asOf, after, limit }: { asOf: Date; after: string | null; limit: number },
  ): Promise<CampaignRef[]> {
    return this.database.forStore(storeId, (tx) => {
      const previous = after
        ? tx
            .select({ scheduledFor: campaigns.scheduledFor, id: campaigns.id })
            .from(campaigns)
            .where(and(eq(campaigns.storeId, storeId), eq(campaigns.id, after)))
        : undefined;
      return tx
        .select({ storeId: campaigns.storeId, campaignId: campaigns.id })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.storeId, storeId),
            eq(campaigns.status, 'scheduled'),
            lte(campaigns.scheduledFor, asOf),
            previous
              ? sql`(${campaigns.scheduledFor}, ${campaigns.id}) > (${previous})`
              : undefined,
          ),
        )
        .orderBy(asc(campaigns.scheduledFor), asc(campaigns.id))
        .limit(limit);
    });
  }

  // Guarded on the send time too, so a campaign edited and approved again meanwhile waits.
  async start(storeId: string, id: string, now: Date): Promise<void> {
    await this.database.forStore(storeId, async (tx) => {
      const due = tx
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(and(statusWhere(storeId, id, 'scheduled'), lte(campaigns.scheduledFor, now)))
        .for('update', { skipLocked: true });
      // An in-flight edit or cancellation should not delay the sweep for other stores.
      await tx
        .update(campaigns)
        .set({ status: 'sending', startedAt: now, updatedAt: now })
        .where(and(eq(campaigns.storeId, storeId), inArray(campaigns.id, due)));
    });
  }
}
