import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';

import type { campaignChannels } from '@dakly/contracts/campaigns';
import { automationRunSteps } from '@dakly/db/schema/automations';
import { campaignRecipients, campaigns } from '@dakly/db/schema/campaigns';

import type { Transaction } from '../platform/database/scoped-transactions';
import { TenantDatabase } from '../platform/database/tenant-database';

export type MarketingSend = {
  contactId: string;
  channel: (typeof campaignChannels)[number];
  sentAt: Date;
};

type SendWindow = { storeId: string; contactIds: string[]; after: Date; until: Date };

// Read-only: the frequency cap counts campaign and workflow sends together from Postgres (A2).
@Injectable()
export class SendingRepository {
  constructor(@Inject(TenantDatabase) private readonly database: TenantDatabase) {}

  // Joins the caller's transaction, so the lock lasts until the message is marked sending and
  // that transaction commits; a second check for the contact waits and then sees that row.
  async lockContact(storeId: string, contactId: string): Promise<void> {
    await this.database.inTransaction(storeId, (tx) =>
      tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`send:${storeId}:${contactId}`}, 0))`,
      ),
    );
  }

  listMarketingSends(
    storeId: string,
    contactIds: string[],
    after: Date,
    until: Date,
  ): Promise<MarketingSend[]> {
    const window = { storeId, contactIds, after, until };
    return this.database.forStore(storeId, async (tx) => {
      const sends = [...(await campaignSends(tx, window)), ...(await workflowSends(tx, window))];
      // A recipient still in sending is a send happening now. Workflow steps always have a
      // channel and send time here; the where clause filters the nulls.
      return sends.map((send) => ({
        contactId: send.contactId,
        channel: send.channel as MarketingSend['channel'],
        sentAt: send.sentAt ?? until,
      }));
    });
  }
}

function campaignSends(tx: Transaction, { storeId, contactIds, after, until }: SendWindow) {
  return tx
    .select({
      contactId: campaignRecipients.contactId,
      channel: campaigns.channel,
      sentAt: campaignRecipients.sentAt,
    })
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
        inArray(campaignRecipients.contactId, contactIds),
        or(
          eq(campaignRecipients.status, 'sending'),
          and(
            inArray(campaignRecipients.status, ['sent', 'delivered', 'read']),
            gt(campaignRecipients.sentAt, after),
            lte(campaignRecipients.sentAt, until),
          ),
        ),
        eq(campaigns.category, 'marketing'),
      ),
    );
}

// A send step counts from its send time, while sending and once sent; a failed send does not.
function workflowSends(tx: Transaction, { storeId, contactIds, after, until }: SendWindow) {
  return tx
    .select({
      contactId: automationRunSteps.contactId,
      channel: automationRunSteps.channel,
      sentAt: automationRunSteps.sentAt,
    })
    .from(automationRunSteps)
    .where(
      and(
        eq(automationRunSteps.storeId, storeId),
        inArray(automationRunSteps.contactId, contactIds),
        gt(automationRunSteps.sentAt, after),
        lte(automationRunSteps.sentAt, until),
        isNotNull(automationRunSteps.channel),
        eq(automationRunSteps.category, 'marketing'),
        inArray(automationRunSteps.outcome, ['sending', 'sent']),
      ),
    );
}
