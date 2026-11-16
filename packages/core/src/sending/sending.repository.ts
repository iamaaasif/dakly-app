import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNotNull, lte, sql } from 'drizzle-orm';

import { automationRunSteps, automationRuns, automations } from '@dakly/db/schema/automations';
import { campaignRecipients, campaigns } from '@dakly/db/schema/campaigns';

import { TenantDatabase } from '../platform/database/tenant-database';

export type MarketingSend = { channel: string; sentAt: Date };

// The where clauses rule out null channels and send times.
function sentAt(column: typeof campaignRecipients.sentAt | typeof automationRunSteps.sentAt) {
  return sql<Date>`${column}`.mapWith(column);
}

// Read-only: the frequency cap counts campaign and workflow sends together from Postgres (A2).
// The campaigns and automations features that own these tables are not built yet.
@Injectable()
export class SendingRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  listMarketingSends(
    storeId: string,
    contactId: string,
    after: Date,
    until: Date,
  ): Promise<MarketingSend[]> {
    return this.database.forStore(storeId, async (tx) => {
      const fromCampaigns = await tx
        .select({ channel: campaigns.channel, sentAt: sentAt(campaignRecipients.sentAt) })
        .from(campaignRecipients)
        .innerJoin(
          campaigns,
          and(
            eq(campaigns.storeId, campaignRecipients.storeId),
            eq(campaigns.id, campaignRecipients.campaignId),
          ),
        )
        .where(
          and(
            eq(campaignRecipients.storeId, storeId),
            eq(campaignRecipients.contactId, contactId),
            gt(campaignRecipients.sentAt, after),
            lte(campaignRecipients.sentAt, until),
            inArray(campaignRecipients.status, ['sent', 'delivered', 'read']),
            eq(campaigns.category, 'marketing'),
          ),
        );
      const fromWorkflows = await tx
        .select({
          channel: sql<string>`${automationRunSteps.channel}`,
          sentAt: sentAt(automationRunSteps.sentAt),
        })
        .from(automationRunSteps)
        .innerJoin(
          automationRuns,
          and(
            eq(automationRuns.storeId, automationRunSteps.storeId),
            eq(automationRuns.id, automationRunSteps.runId),
          ),
        )
        .innerJoin(
          automations,
          and(
            eq(automations.storeId, automationRuns.storeId),
            eq(automations.id, automationRuns.automationId),
          ),
        )
        .where(
          and(
            eq(automationRunSteps.storeId, storeId),
            eq(automationRunSteps.contactId, contactId),
            gt(automationRunSteps.sentAt, after),
            lte(automationRunSteps.sentAt, until),
            isNotNull(automationRunSteps.channel),
            eq(automations.isTransactional, false),
          ),
        );
      return [...fromCampaigns, ...fromWorkflows];
    });
  }
}
