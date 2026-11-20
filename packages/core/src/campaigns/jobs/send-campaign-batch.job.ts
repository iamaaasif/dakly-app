import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { CampaignBatchService } from '../campaign-batch.service';

export const SEND_CAMPAIGN_BATCH = 'send-campaign-batch';

const payload = z.strictObject({ storeId: z.uuid() });

@HandlesJob({ queue: QUEUES.campaign, name: SEND_CAMPAIGN_BATCH })
export class SendCampaignBatchJob implements JobHandler {
  constructor(@Inject(CampaignBatchService) private readonly batch: CampaignBatchService) {}

  async handle(data: unknown) {
    const { storeId } = payload.parse(data);
    return this.batch.sendStoreBatch(storeId);
  }
}
