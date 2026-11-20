import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { CampaignSenderService } from '../campaign-sender.service';

export const SEND_CAMPAIGN_BATCH = 'send-campaign-batch';

const payload = z.strictObject({ storeId: z.uuid(), campaignId: z.uuid() });

@HandlesJob({ queue: QUEUES.campaign, name: SEND_CAMPAIGN_BATCH })
export class SendCampaignBatchJob implements JobHandler {
  constructor(@Inject(CampaignSenderService) private readonly sender: CampaignSenderService) {}

  async handle(data: unknown) {
    const { storeId, campaignId } = payload.parse(data);
    const next = await this.sender.sendBatch(storeId, campaignId);
    if (next) return { delayUntil: next.getTime() };
  }
}
