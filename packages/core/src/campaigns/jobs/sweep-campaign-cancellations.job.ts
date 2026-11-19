import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { CampaignCancellationsService } from '../campaign-cancellations.service';

export const SWEEP_CAMPAIGN_CANCELLATIONS = 'sweep-campaign-cancellations';

// Platform-wide sweep. Individual settlement jobs carry the store and campaign IDs.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.campaign, name: SWEEP_CAMPAIGN_CANCELLATIONS })
export class SweepCampaignCancellationsJob implements JobHandler {
  constructor(
    @Inject(CampaignCancellationsService)
    private readonly cancellations: CampaignCancellationsService,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.cancellations.sweep();
  }
}
