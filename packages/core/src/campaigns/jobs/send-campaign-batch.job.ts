import { InjectQueue } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import { z } from 'zod';

import { Clock } from '../../platform/clock';
import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { JOB_POLL_INTERVAL_MS } from '../../platform/time';
import { CampaignSenderService } from '../campaign-sender.service';

export const SEND_CAMPAIGN_BATCH = 'send-campaign-batch';

const payload = z.strictObject({ storeId: z.uuid(), campaignId: z.uuid() });

const batchJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
  removeOnComplete: true,
  removeOnFail: 100,
} satisfies JobsOptions;

// The sweep's job for a campaign is dropped while one is waiting or running.
export function sweptBatchJob(storeId: string, campaignId: string) {
  return {
    name: SEND_CAMPAIGN_BATCH,
    data: { storeId, campaignId },
    opts: { ...batchJobOptions, deduplication: { id: campaignId } },
  };
}

@HandlesJob({ queue: QUEUES.campaign, name: SEND_CAMPAIGN_BATCH })
export class SendCampaignBatchJob implements JobHandler {
  constructor(
    @Inject(CampaignSenderService) private readonly sender: CampaignSenderService,
    @InjectQueue(QUEUES.campaign) private readonly queue: Queue,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // The next batch goes to the back of the queue, behind other campaigns. Its job id holds its
  // start time, so batches deferred to the end of quiet hours are queued once.
  async handle(data: unknown) {
    const { storeId, campaignId } = payload.parse(data);
    const next = await this.sender.sendBatch(storeId, campaignId);
    if (!next) return;
    await this.queue.add(
      SEND_CAMPAIGN_BATCH,
      { storeId, campaignId },
      {
        ...batchJobOptions,
        delay: Math.max(0, next.getTime() - this.clock.now().getTime()),
        jobId: `${campaignId}-${next.getTime()}`,
      },
    );
  }
}
