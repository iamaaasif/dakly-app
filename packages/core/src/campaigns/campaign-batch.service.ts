import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { JOB_POLL_INTERVAL_MS } from '../platform/time';
import { CampaignCountsService } from './campaign-counts.service';
import { CAMPAIGN_CLAIM_MS, CampaignSenderService } from './campaign-sender.service';
import { CampaignSendingRepository } from './campaign-sending.repository';

@Injectable()
export class CampaignBatchService {
  constructor(
    @Inject(CampaignSendingRepository) private readonly repository: CampaignSendingRepository,
    @Inject(CampaignSenderService) private readonly sender: CampaignSenderService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(CampaignCountsService) private readonly counts: CampaignCountsService,
  ) {}

  async sendStoreBatch(storeId: string): Promise<void | { delayUntil: number }> {
    const moreRepairs = await this.counts.repairNext(storeId);
    const expired = new Date(this.clock.now().getTime() - CAMPAIGN_CLAIM_MS);
    const campaignId = await this.repository.nextCampaignId(storeId, expired);
    const next = campaignId ? await this.sender.sendBatch(storeId, campaignId) : null;
    const now = this.clock.now().getTime();
    // Wake at least every poll interval so this store can settle a cancellation
    // while the next send waits.
    if (next) return { delayUntil: Math.min(next.getTime(), now + JOB_POLL_INTERVAL_MS) };
    if (moreRepairs) return { delayUntil: now };
    if (!campaignId) return;
    const remaining = await this.repository.nextCampaignId(
      storeId,
      new Date(now - CAMPAIGN_CLAIM_MS),
    );
    // The next sweep can retry the same campaign without spinning on a stopped claim.
    if (remaining && remaining !== campaignId) return { delayUntil: now };
  }
}
