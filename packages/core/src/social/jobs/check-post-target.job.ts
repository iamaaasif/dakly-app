import { Inject } from '@nestjs/common';

import { scheduledPostTargetSchema } from '@dakly/contracts/social';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { SocialPublishingService } from '../social-publishing.service';

export const CHECK_POST_TARGET = 'check-post-target';

@HandlesJob({ queue: QUEUES.outbound, name: CHECK_POST_TARGET })
export class CheckPostTargetJob implements JobHandler {
  constructor(
    @Inject(SocialPublishingService) private readonly publishing: SocialPublishingService,
  ) {}

  async handle(data: unknown) {
    const { storeId, ...target } = scheduledPostTargetSchema.parse(data);
    await this.publishing.checkTarget(storeId, target);
  }
}
