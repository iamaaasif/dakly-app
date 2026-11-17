import { Inject, Injectable } from '@nestjs/common';
import { and, lte, sql } from 'drizzle-orm';

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

  // The sweeps run across stores, so SECURITY DEFINER functions name the campaigns with work.
  async listDue(asOf: Date): Promise<CampaignRef[]> {
    const result = await this.global.execute<CampaignRef>(
      sql`select store_id as "storeId", campaign_id as "campaignId" from due_campaigns(${asOf.toISOString()}::timestamptz)`,
    );
    return result.rows;
  }

  // Guarded on the send time too, so a campaign edited and approved again meanwhile waits.
  async start(storeId: string, id: string, now: Date): Promise<void> {
    await this.database.forStore(storeId, (tx) =>
      tx
        .update(campaigns)
        .set({ status: 'sending', startedAt: now, updatedAt: now })
        .where(and(statusWhere(storeId, id, 'scheduled'), lte(campaigns.scheduledFor, now))),
    );
  }
}
