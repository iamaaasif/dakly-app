import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gt, inArray, isNotNull, lte, ne, or, sql } from 'drizzle-orm';

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

type SendWindow = {
  storeId: string;
  contactIds?: string[];
  channel?: MarketingSend['channel'];
  after: Date;
  until: Date;
  dispatch?: boolean;
  excludeCampaignRecipientId?: string;
  excludeWorkflowStepId?: string;
  includeCommittedFuture?: boolean;
};

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

  // The whole shop's marketing sends on one channel, for the daily limit. It takes no lock, so
  // two workers sending at once can pass the limit by a few messages.
  async countChannelSends(
    storeId: string,
    channel: MarketingSend['channel'],
    range: Pick<SendWindow, 'after' | 'until'>,
  ): Promise<number> {
    const window = { storeId, channel, dispatch: true, ...range };
    return this.database.forStore(storeId, async (tx) => {
      // The database counts the rows; a big campaign day would be thousands to read here.
      const [campaign] = await tx
        .select({ sends: count() })
        .from(campaignSends(tx, window).as('campaign_sends'));
      const [workflow] = await tx
        .select({ sends: count() })
        .from(workflowSends(tx, window).as('workflow_sends'));
      return (campaign?.sends ?? 0) + (workflow?.sends ?? 0);
    });
  }

  listMarketingSends(
    storeId: string,
    contactIds: string[],
    range: Omit<SendWindow, 'storeId' | 'contactIds' | 'channel'>,
  ): Promise<MarketingSend[]> {
    const window = { storeId, contactIds, ...range };
    return this.database.forStore(storeId, async (tx) => {
      const sends = [...(await campaignSends(tx, window)), ...(await workflowSends(tx, window))];
      // Live checks reserve a slot for unresolved campaign claims. Audience estimates
      // count those claims in the window in which they occurred.
      return sends.map((send) => ({
        contactId: send.contactId,
        channel: send.channel as MarketingSend['channel'],
        sentAt: send.sentAt ?? range.until,
      }));
    });
  }
}

function campaignSends(tx: Transaction, window: SendWindow) {
  const { storeId, contactIds, channel, after, until } = window;
  const { dispatch, excludeCampaignRecipientId, includeCommittedFuture } = window;
  const live = dispatch || includeCommittedFuture;
  const pending = eq(campaignRecipients.status, 'sending');
  const liveClaim = live ? pending : undefined;
  const uncertain = and(
    eq(campaignRecipients.status, 'failed'),
    eq(campaignRecipients.errorCode, 'outcome_unknown'),
  );
  const claimed = or(uncertain, live ? undefined : pending);
  const dispatchStartedAt = sql<Date>`coalesce(${campaignRecipients.dispatchStartedAt}, ${campaignRecipients.claimedAt})`;
  const acceptedAt = sql<Date>`greatest(${campaignRecipients.sentAt}, ${campaignRecipients.dispatchStartedAt})`;
  return tx
    .select({
      contactId: campaignRecipients.contactId,
      channel: campaigns.channel,
      sentAt: sql<Date | null>`case when ${liveClaim ?? sql`false`} then null
          when ${claimed} then ${dispatchStartedAt} else ${acceptedAt} end`.mapWith(
        campaignRecipients.sentAt,
      ),
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
        contactIds ? inArray(campaignRecipients.contactId, contactIds) : undefined,
        channel ? eq(campaigns.channel, channel) : undefined,
        excludeCampaignRecipientId
          ? ne(campaignRecipients.id, excludeCampaignRecipientId)
          : undefined,
        or(
          liveClaim,
          and(
            claimed,
            gt(dispatchStartedAt, after),
            includeCommittedFuture ? undefined : lte(dispatchStartedAt, until),
          ),
          and(
            inArray(campaignRecipients.status, ['sent', 'delivered', 'read']),
            gt(acceptedAt, after),
            includeCommittedFuture ? undefined : lte(acceptedAt, until),
          ),
        ),
        eq(campaigns.category, 'marketing'),
      ),
    );
}

// Uncertain submissions count too: the provider may have accepted them; definite refusals do not.
function workflowSends(tx: Transaction, window: SendWindow) {
  const { storeId, contactIds, channel, after, until } = window;
  const { excludeWorkflowStepId, includeCommittedFuture } = window;
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
        contactIds ? inArray(automationRunSteps.contactId, contactIds) : undefined,
        channel ? eq(automationRunSteps.channel, channel) : undefined,
        gt(automationRunSteps.sentAt, after),
        includeCommittedFuture ? undefined : lte(automationRunSteps.sentAt, until),
        isNotNull(automationRunSteps.channel),
        excludeWorkflowStepId ? ne(automationRunSteps.id, excludeWorkflowStepId) : undefined,
        eq(automationRunSteps.category, 'marketing'),
        inArray(automationRunSteps.outcome, ['sending', 'sent', 'unconfirmed']),
      ),
    );
}
