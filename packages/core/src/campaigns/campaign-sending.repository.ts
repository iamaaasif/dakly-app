import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';

import type { Database } from '@dakly/db/client';
import { campaigns } from '@dakly/db/schema/campaigns';

import { DATABASE } from '../platform/database/database.tokens';
import { TenantDatabase } from '../platform/database/tenant-database';
import { MINUTE_MS } from '../platform/time';
import { statusWhere } from './campaigns.repository';

export type CampaignRef = { storeId: string; campaignId: string };

// The sender's reads and writes: the sweeps, the recipient claims and the settlement.
@Injectable()
export class CampaignSendingRepository {
  constructor(
    @Inject(TenantDatabase) private readonly database: TenantDatabase,
    @Inject(DATABASE) private readonly global: Database,
  ) {}

  // The sweeps run across stores, so SECURITY DEFINER functions name the campaigns with work.
  async listDue(asOf: Date, limit: number): Promise<CampaignRef[]> {
    const rotation = Math.floor(asOf.getTime() / MINUTE_MS) * limit;
    const result = await this.global.execute<CampaignRef>(sql`
      with ranked as (
        select store_id, campaign_id,
          row_number() over (partition by store_id order by campaign_id) as turn,
          dense_rank() over (order by store_id) - 1 as store_slot
        from due_campaigns(${asOf.toISOString()}::timestamptz)
      ), sized as (
        select *, max(store_slot) over () + 1 as store_count from ranked
      )
      select store_id as "storeId", campaign_id as "campaignId" from sized
      order by turn, (store_slot + store_count - ${rotation}::bigint % store_count) % store_count
      limit ${limit}
    `);
    return result.rows;
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
