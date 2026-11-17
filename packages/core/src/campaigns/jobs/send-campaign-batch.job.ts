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

// One chain of batches per campaign: a batch is dropped while another for the same campaign is
// waiting, delayed or running.
export function batchJob(storeId: string, campaignId: string, delay = 0) {
  return {
    name: SEND_CAMPAIGN_BATCH,
    data: { storeId, campaignId },
    opts: { ...batchJobOptions, delay, deduplication: { id: campaignId } },
  };
}

@HandlesJob({ queue: QUEUES.campaign, name: SEND_CAMPAIGN_BATCH })
export class SendCampaignBatchJob implements JobHandler {
  constructor(
    @Inject(CampaignSenderService) private readonly sender: CampaignSenderService,
    @InjectQueue(QUEUES.campaign) private readonly queue: Queue,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // This running job holds the campaign's key, so it frees the key just before queueing the next
  // batch, which goes to the back of the queue behind other campaigns.
  async handle(data: unknown) {
    const { storeId, campaignId } = payload.parse(data);
    const next = await this.sender.sendBatch(storeId, campaignId);
    if (!next) return;
    const {
      name,
      data: job,
      opts,
    } = batchJob(storeId, campaignId, Math.max(0, next.getTime() - this.clock.now().getTime()));
    await this.queue.removeDeduplicationKey(campaignId);
    await this.queue.add(name, job, opts);
  }
}
