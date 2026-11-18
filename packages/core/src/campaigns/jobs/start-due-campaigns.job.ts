import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { CampaignSenderService } from '../campaign-sender.service';

export const START_DUE_CAMPAIGNS = 'start-due-campaigns';

// A scheduled sweep over every store, so the payload has no store.
const payload = z.strictObject({});
@HandlesJob({ queue: QUEUES.campaign, name: START_DUE_CAMPAIGNS })
export class StartDueCampaignsJob implements JobHandler {
  constructor(@Inject(CampaignSenderService) private readonly sender: CampaignSenderService) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.sender.startDue();
  }
}
