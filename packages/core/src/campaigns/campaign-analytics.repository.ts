import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, lt, sql } from 'drizzle-orm';

import { campaigns } from '@dakly/db/schema/campaigns';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class CampaignAnalyticsRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Campaigns whose sending started in the shop-local day range, with the counts kept on the campaign.
  startedBetween(
    storeId: string,
    { from, through, timeZone }: { from: string; through: string; timeZone: string },
  ) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: campaigns.id,
          name: campaigns.name,
          channel: campaigns.channel,
          startedAt: campaigns.startedAt,
          sent: campaigns.sentCount,
          delivered: campaigns.deliveredCount,
          read: campaigns.readCount,
          tappedPeople: campaigns.tappedCount,
          costPoisha: campaigns.actualCostPoisha,
        })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.storeId, storeId),
            gt(campaigns.sentCount, 0),
            gte(campaigns.startedAt, sql`(${from}::date)::timestamp at time zone ${timeZone}`),
            lt(
              campaigns.startedAt,
              sql`(${through}::date + 1)::timestamp at time zone ${timeZone}`,
            ),
          ),
        )
        .orderBy(asc(campaigns.startedAt)),
    );
  }
}
