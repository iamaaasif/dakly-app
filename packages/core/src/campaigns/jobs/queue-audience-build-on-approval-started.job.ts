import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { campaignApprovalStartedEventSchema } from '@dakly/contracts/events/campaigns';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { CampaignApprovalQueueService } from '../campaign-approval-queue.service';

const event = campaignApprovalStartedEventSchema.extend({ id: z.uuid() });

@HandlesEvent('campaign.approval_started', { queue: QUEUES.campaign })
export class QueueAudienceBuildOnApprovalStarted implements JobHandler {
  constructor(
    @Inject(CampaignApprovalQueueService) private readonly approval: CampaignApprovalQueueService,
  ) {}

  async handle(data: unknown) {
    const {
      storeId,
      payload: { campaignId, approvedAt },
    } = event.parse(data);
    await this.approval.enqueue(storeId, { id: campaignId, approvedAt: new Date(approvedAt) });
  }
}
