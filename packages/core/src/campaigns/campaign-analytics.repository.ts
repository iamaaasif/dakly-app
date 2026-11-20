import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, lt, ne, or, sql } from 'drizzle-orm';

import { campaignRecipients, campaigns } from '@dakly/db/schema/campaigns';

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

  // The sends an order's buyer received from these campaigns, for last-touch attribution.
  attributionSources(storeId: string, buyer: { id: string; phone: string }, ids: string[]) {
    return this.database.forStore(storeId, (tx) =>
      tx
        .select({
          id: campaigns.id,
          sourceId: campaigns.id,
          channel: campaigns.channel,
          sentAt: campaignRecipients.sentAt,
        })
        .from(campaignRecipients)
        .innerJoin(
          campaigns,
          and(eq(campaigns.storeId, storeId), eq(campaigns.id, campaignRecipients.campaignId)),
        )
        .where(
          and(
            eq(campaignRecipients.storeId, storeId),
            eq(campaignRecipients.contactId, buyer.id),
            inArray(campaignRecipients.campaignId, ids),
            inArray(campaignRecipients.status, ['sent', 'delivered', 'read']),
            or(
              ne(campaigns.channel, 'sms'),
              eq(campaignRecipients.destinationAddress, buyer.phone),
            ),
          ),
        ),
    );
  }
}
