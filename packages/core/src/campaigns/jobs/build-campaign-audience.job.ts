import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { CampaignApprovalService } from '../campaign-approval.service';

export const BUILD_CAMPAIGN_AUDIENCE = 'build-campaign-audience';

const payload = z.strictObject({
  storeId: z.uuid(),
  campaignId: z.uuid(),
  approvedAt: z.iso.datetime(),
});

@HandlesJob({ queue: QUEUES.campaign, name: BUILD_CAMPAIGN_AUDIENCE })
export class BuildCampaignAudienceJob implements JobHandler {
  constructor(
    @Inject(CampaignApprovalService) private readonly approval: CampaignApprovalService,
  ) {}

  async handle(data: unknown) {
    const { storeId, campaignId, approvedAt } = payload.parse(data);
    return this.approval.build(storeId, { id: campaignId, approvedAt: new Date(approvedAt) });
  }
}
