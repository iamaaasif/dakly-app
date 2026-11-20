import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';

import type { CampaignSourceOutcome } from '@dakly/contracts/campaigns';
import { campaignRecipients } from '@dakly/db/schema/campaigns';

import { TenantDatabase } from '../platform/database/tenant-database';

// The people a finished campaign reached for one outcome: delivered and never read, or tapped.
// The follow-up still drops people who ordered, which the audience service asks Analytics for.
function reached(storeId: string, campaignId: string, outcome: CampaignSourceOutcome) {
  return and(
    eq(campaignRecipients.storeId, storeId),
    eq(campaignRecipients.campaignId, campaignId),
    outcome === 'resend_unread'
      ? and(eq(campaignRecipients.status, 'delivered'), isNull(campaignRecipients.readAt))
      : isNotNull(campaignRecipients.tappedAt),
  );
}

@Injectable()
export class CampaignSourceAudienceRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  contactIds(
    storeId: string,
    source: { campaignId: string; outcome: CampaignSourceOutcome },
    { cursor, limit }: { cursor?: string; limit: number },
  ): Promise<string[]> {
    return this.database
      .forStore(storeId, (tx) =>
        tx
          .select({ contactId: campaignRecipients.contactId })
          .from(campaignRecipients)
          .where(
            and(
              reached(storeId, source.campaignId, source.outcome),
              cursor ? gt(campaignRecipients.contactId, cursor) : undefined,
            ),
          )
          .orderBy(asc(campaignRecipients.contactId))
          .limit(limit),
      )
      .then((rows) => rows.map(({ contactId }) => contactId));
  }

  async count(
    storeId: string,
    source: { campaignId: string; outcome: CampaignSourceOutcome },
  ): Promise<number> {
    const [row] = await this.database.forStore(storeId, (tx) =>
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(campaignRecipients)
        .where(reached(storeId, source.campaignId, source.outcome)),
    );
    return row?.count ?? 0;
  }
}
