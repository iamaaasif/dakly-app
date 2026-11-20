import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { CampaignCountsRepository } from './campaign-counts.repository';
import { CampaignSendingRepository } from './campaign-sending.repository';
import { CampaignsRepository, type LockedCampaign } from './campaigns.repository';

const REFRESH_MS = 10_000;

type RecipientUpdate = Parameters<CampaignSendingRepository['changeRecipient']>;
type RecipientOutcome = {
  recipientId: string;
  guard: RecipientUpdate[2];
  change: RecipientUpdate[3];
};
type Acceptance = {
  recipientId: string;
  providerMessageId: string;
  // Null for a message that costs no credits.
  credits: number | null;
  sentAt: Date;
  requireSavedReceipt: boolean;
  // Set on a sent message that went out without its image.
  errorCode?: 'image_rejected';
};

@Injectable()
export class CampaignCountsService {
  constructor(
    @Inject(CampaignsRepository) private readonly campaigns: CampaignsRepository,
    @Inject(CampaignCountsRepository) private readonly counts: CampaignCountsRepository,
    @Inject(CampaignSendingRepository) private readonly sending: CampaignSendingRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async repairNext(storeId: string): Promise<boolean> {
    const id = await this.counts.nextPending(storeId);
    if (!id) return false;
    await this.refresh(storeId, id, 'batch');
    return Boolean(await this.counts.nextPending(storeId));
  }

  async refresh(storeId: string, id: string, mode: 'batch' | 'force'): Promise<void> {
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, id, 'update');
      if (!campaign || ['draft', 'scheduled'].includes(campaign.status)) return;
      const now = this.clock.now().getTime();
      const previous = campaign.countsAt?.getTime() ?? -Infinity;
      if (mode === 'batch' && campaign.status === 'sending' && now - previous < REFRESH_MS) return;
      await this.counts.save(storeId, id, new Date(Math.max(now, previous)));
    });
  }

  async recordAcceptance(
    storeId: string,
    id: string,
    { recipientId, providerMessageId, credits, sentAt, requireSavedReceipt, errorCode }: Acceptance,
  ): Promise<void> {
    await this.recordOutcome(storeId, id, {
      recipientId,
      guard: {
        status: 'sending',
        uncertainReceipt: providerMessageId,
        providerMessageId: requireSavedReceipt ? providerMessageId : undefined,
      },
      change: {
        status: 'sent',
        providerMessageId,
        smsCredits: credits,
        sentAt,
        claimedAt: null,
        errorCode: errorCode ?? null,
        failedAt: null,
      },
    });
  }

  async recordOutcome(
    storeId: string,
    id: string,
    { recipientId, guard, change }: RecipientOutcome,
  ): Promise<void> {
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, id, 'update');
      if (!campaign) return;
      const recorded = await this.sending.changeRecipient(storeId, recipientId, guard, change);
      await this.markPending(storeId, campaign, recorded);
    });
  }

  async markPending(storeId: string, campaign: LockedCampaign, recorded: boolean) {
    if (recorded && campaign.status !== 'sending')
      await this.counts.markPending(storeId, campaign.id);
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
