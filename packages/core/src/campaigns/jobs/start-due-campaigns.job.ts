import { InjectQueue } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { JOB_POLL_INTERVAL_MS } from '../../platform/time';
import { CampaignSweepService, type CampaignBatch } from '../campaign-sweep.service';
import { SEND_CAMPAIGN_BATCH } from './send-campaign-batch.job';

export const START_DUE_CAMPAIGNS = 'start-due-campaigns';

// A scheduled sweep over every store, so the payload has no store.
const payload = z.strictObject({});
@HandlesJob({ queue: QUEUES.campaign, name: START_DUE_CAMPAIGNS })
export class StartDueCampaignsJob implements JobHandler {
  constructor(
    @Inject(CampaignSweepService) private readonly sweep: CampaignSweepService,
    @InjectQueue(QUEUES.campaign) private readonly queue: Queue<CampaignBatch>,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.sweep.startDue(await this.queue.getWaitingCount(), async (batches) => {
      if (!batches.length) return;
      await this.queue.addBulk(
        batches.map((data) => ({
          name: SEND_CAMPAIGN_BATCH,
          data,
          opts: {
            deduplication: { id: `${data.storeId}-${data.lane}` },
            attempts: 3,
            backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
            removeOnComplete: true,
            removeOnFail: 100,
          },
        })),
      );
    });
  }
}
