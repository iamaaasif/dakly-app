import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { SocialPublishingQueueService } from '../social-publishing-queue.service';

export const RECOVER_POST_TARGETS = 'recover-post-targets';

// The sweep finds targets that are due across stores.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.sync, name: RECOVER_POST_TARGETS })
export class RecoverPostTargetsJob implements JobHandler {
  constructor(
    @Inject(SocialPublishingQueueService) private readonly publishing: SocialPublishingQueueService,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.publishing.recoverDueTargets();
  }
}
