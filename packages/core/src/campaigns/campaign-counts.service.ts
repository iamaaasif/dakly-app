import { Inject, Injectable } from '@nestjs/common';

import { StoreTransaction } from '../platform/database/store-transaction';
import { CampaignCountsRepository } from './campaign-counts.repository';
import { CampaignSendingRepository } from './campaign-sending.repository';
import { CampaignsRepository, type Campaign } from './campaigns.repository';

const REFRESH_MS = 10_000;

type Acceptance = {
  recipientId: string;
  providerMessageId: string;
  credits: number;
  sentAt: Date;
  requireSavedReceipt?: boolean;
};

@Injectable()
export class CampaignCountsService {
  constructor(
    @Inject(CampaignsRepository) private readonly campaigns: CampaignsRepository,
    @Inject(CampaignCountsRepository) private readonly counts: CampaignCountsRepository,
    @Inject(CampaignSendingRepository) private readonly sending: CampaignSendingRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async fillMissing(storeId: string, campaigns: Campaign[]): Promise<Campaign[]> {
    const ids = campaigns
      .filter(
        ({ countsAt, status }) => countsAt === null && !['draft', 'scheduled'].includes(status),
      )
      .map(({ id }) => id);
    if (ids.length === 0) return campaigns;
    const rows = await this.counts.read(storeId, ids);
    const totals = new Map(rows.map((row) => [row.id, row]));
    return campaigns.map((campaign) => ({ ...campaign, ...totals.get(campaign.id) }));
  }

  async refresh(storeId: string, id: string, mode: 'batch' | 'force'): Promise<void> {
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, id, 'update');
      if (!campaign) return;
      if (mode === 'batch' && !['sending', 'paused', 'cancelled', 'sent'].includes(campaign.status))
        return;
      const now = await this.counts.currentTime(storeId);
      const previous = campaign.countsAt?.getTime() ?? -Infinity;
      if (mode === 'batch' && campaign.status === 'sending' && now - previous < REFRESH_MS) return;
      await this.counts.save(storeId, id, new Date(Math.max(now, previous)));
    });
  }

  async recordAcceptance(
    storeId: string,
    id: string,
    { recipientId, providerMessageId, credits, sentAt, requireSavedReceipt }: Acceptance,
  ): Promise<void> {
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, id, 'update');
      if (!campaign) return;
      // A late acceptance can replace an unresolved outcome for the same receipt.
      const recorded = await this.sending.changeRecipient(
        storeId,
        recipientId,
        {
          status: 'sending',
          uncertainReceipt: providerMessageId,
          providerMessageId: requireSavedReceipt ? providerMessageId : undefined,
        },
        {
          status: 'sent',
          providerMessageId,
          smsCredits: credits,
          sentAt,
          claimedAt: null,
          errorCode: null,
          failedAt: null,
        },
      );
      if (recorded && campaign.status !== 'sending') await this.refresh(storeId, id, 'force');
    });
  }

  async recordTap(
    storeId: string,
    tap: { campaignId: string; contactId: string; at: Date },
  ): Promise<void> {
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, tap.campaignId, 'update');
      if (campaign?.approvedAt) await this.counts.recordTap(storeId, tap);
    });
  }
}
