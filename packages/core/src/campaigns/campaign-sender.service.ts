import { Inject, Injectable, Logger } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { CampaignSendingRepository } from './campaign-sending.repository';

@Injectable()
export class CampaignSenderService {
  private readonly logger = new Logger(CampaignSenderService.name);

  constructor(
    @Inject(CampaignSendingRepository) private readonly repository: CampaignSendingRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // One store's failure must not hold up the others; its campaign is tried again next minute.
  async startDue(): Promise<void> {
    const now = this.clock.now();
    for (const { storeId, campaignId } of await this.repository.listDue(now))
      await this.repository.start(storeId, campaignId, now).catch(() => {
        this.logger.error({ storeId, campaignId }, 'Campaign start failed');
      });
  }
}
