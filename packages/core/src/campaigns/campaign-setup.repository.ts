import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { campaigns } from '@dakly/db/schema/campaigns';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class CampaignSetupRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  async hasStarted(storeId: string): Promise<boolean> {
    const rows = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.storeId, storeId),
            inArray(campaigns.status, ['sending', 'paused', 'sent']),
          ),
        )
        .limit(1),
    );
    return rows.length > 0;
  }
}
