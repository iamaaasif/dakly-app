import { InjectQueue } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { CampaignSenderService } from '../campaign-sender.service';
import { sweptBatchJob } from './send-campaign-batch.job';

export const START_DUE_CAMPAIGNS = 'start-due-campaigns';

// A scheduled sweep over every store, so the payload has no store.
const payload = z.strictObject({});
@HandlesJob({ queue: QUEUES.campaign, name: START_DUE_CAMPAIGNS })
export class StartDueCampaignsJob implements JobHandler {
  constructor(
    @Inject(CampaignSenderService) private readonly sender: CampaignSenderService,
    @InjectQueue(QUEUES.campaign) private readonly queue: Queue,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    const campaigns = await this.sender.startDue();
    await this.queue.addBulk(
      campaigns.map(({ storeId, campaignId }) => sweptBatchJob(storeId, campaignId)),
    );
  }
}
