import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { CampaignSendingRepository } from './campaign-sending.repository';

@Injectable()
export class CampaignSenderService {
  constructor(
    @Inject(CampaignSendingRepository) private readonly repository: CampaignSendingRepository,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async startDue(): Promise<void> {
    const now = this.clock.now();
    for (const { storeId, campaignId } of await this.repository.listDue(now))
      await this.repository.start(storeId, campaignId, now);
  }
}
