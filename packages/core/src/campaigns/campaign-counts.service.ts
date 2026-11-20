import { Inject, Injectable } from '@nestjs/common';

import { StoreTransaction } from '../platform/database/store-transaction';
import { CampaignCountsRepository } from './campaign-counts.repository';
import { CampaignSendingRepository } from './campaign-sending.repository';
import { CampaignsRepository, type LockedCampaign } from './campaigns.repository';

const REFRESH_MS = 10_000;

type RecipientUpdate = Parameters<CampaignSendingRepository['changeRecipient']>;

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

  async refresh(storeId: string, id: string, mode: 'batch' | 'force'): Promise<void> {
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, id, 'update');
      if (!campaign) return;
      if (['draft', 'scheduled'].includes(campaign.status)) return;
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
    // A late acceptance can replace an unresolved outcome for the same receipt.
    await this.recordOutcome(
      storeId,
      id,
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
  }

  async recordOutcome(
    storeId: string,
    id: string,
    recipientId: string,
    guard: RecipientUpdate[2],
    change: RecipientUpdate[3],
  ): Promise<void> {
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, id, 'update');
      if (!campaign || !(await this.sending.changeRecipient(storeId, recipientId, guard, change)))
        return;
      await this.markPending(storeId, campaign);
    });
  }

  async markPending(storeId: string, { id, status }: Pick<LockedCampaign, 'id' | 'status'>) {
    if (status !== 'sending') await this.counts.markPending(storeId, id);
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
