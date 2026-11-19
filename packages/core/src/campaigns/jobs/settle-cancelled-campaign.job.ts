import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import {
  CampaignCancellationsService,
  SETTLE_CANCELLED_CAMPAIGN,
} from '../campaign-cancellations.service';

const payload = z.strictObject({ storeId: z.uuid(), campaignId: z.uuid() });

@HandlesJob({ queue: QUEUES.campaign, name: SETTLE_CANCELLED_CAMPAIGN })
export class SettleCancelledCampaignJob implements JobHandler {
  constructor(
    @Inject(CampaignCancellationsService)
    private readonly cancellations: CampaignCancellationsService,
  ) {}

  async handle(data: unknown) {
    await this.cancellations.settle(payload.parse(data));
  }
}
