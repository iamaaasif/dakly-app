import { Inject } from '@nestjs/common';

import { scheduledPostTargetSchema } from '@dakly/contracts/social';

import { KillSwitchesService } from '../../kill-switches/kill-switches.service';
import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { SocialPublishingService } from '../social-publishing.service';

export const PUBLISH_POST_TARGET = 'publish-post-target';

@HandlesJob({ queue: QUEUES.outbound, name: PUBLISH_POST_TARGET })
export class PublishPostTargetJob implements JobHandler {
  constructor(
    @Inject(SocialPublishingService) private readonly publishing: SocialPublishingService,
    @Inject(KillSwitchesService) private readonly switches: KillSwitchesService,
  ) {}

  async handle(data: unknown, finalAttempt: boolean) {
    const { storeId, ...target } = scheduledPostTargetSchema.parse(data);
    const paused = await this.switches.deferIfPaused('social_posting', storeId);
    if (paused) return paused;
    await this.publishing.publishTarget(storeId, target, finalAttempt);
  }
}
