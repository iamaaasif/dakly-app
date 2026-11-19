import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { postScheduledEventSchema } from '@dakly/contracts/events/social';

import { HandlesEvent } from '../../platform/outbox/handles-event';
import type { JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { SocialPublishingQueueService } from '../social-publishing-queue.service';

const event = postScheduledEventSchema.extend({ id: z.uuid() });

@HandlesEvent('post.scheduled', { queue: QUEUES.outbound })
export class QueuePostOnScheduledJob implements JobHandler {
  constructor(
    @Inject(SocialPublishingQueueService) private readonly publishing: SocialPublishingQueueService,
  ) {}

  async handle(data: unknown) {
    const {
      storeId,
      payload: { postTargetId, scheduledFor },
    } = event.parse(data);
    await this.publishing.enqueueTargets(storeId, [{ postTargetId, scheduledFor }]);
  }
}
