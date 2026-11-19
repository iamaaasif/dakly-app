import { Inject, Injectable } from '@nestjs/common';

import { StoreTransaction } from '../platform/database/store-transaction';
import { CampaignCountsRepository } from './campaign-counts.repository';
import { CampaignsRepository } from './campaigns.repository';

const REFRESH_MS = 10_000;

@Injectable()
export class CampaignCountsService {
  constructor(
    @Inject(CampaignsRepository) private readonly campaigns: CampaignsRepository,
    @Inject(CampaignCountsRepository) private readonly counts: CampaignCountsRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
  ) {}

  async refresh(storeId: string, id: string, mode: 'batch' | 'force'): Promise<void> {
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, id, 'update');
      if (!campaign) return;
      if (mode === 'batch' && !['sending', 'paused', 'cancelled'].includes(campaign.status)) return;
      const now = await this.counts.currentTime(storeId);
      const previous = campaign.countsAt?.getTime() ?? -Infinity;
      if (mode === 'batch' && campaign.status === 'sending' && now - previous < REFRESH_MS) return;
      await this.counts.save(storeId, id, new Date(Math.max(now, previous)));
    });
  }

  async recordTap(
    storeId: string,
    tap: { campaignId: string; contactId: string; at: Date },
  ): Promise<void> {
    await this.transaction.run(storeId, async () => {
      const campaign = await this.campaigns.lockCampaign(storeId, tap.campaignId, 'update');
      if (!campaign?.approvedAt || !(await this.counts.recordTap(storeId, tap))) return;
      await this.refresh(storeId, tap.campaignId, 'force');
    });
  }
}
