import { Inject } from '@nestjs/common';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { SocialInsightsQueueService } from '../social-insights-queue.service';

export const QUEUE_POST_METRICS_REFRESHES = 'queue-post-metrics-refreshes';

// The sweep finds due posts across stores.
const payload = z.strictObject({});

@HandlesJob({ queue: QUEUES.sync, name: QUEUE_POST_METRICS_REFRESHES })
export class QueuePostMetricsRefreshesJob implements JobHandler {
  constructor(
    @Inject(SocialInsightsQueueService) private readonly queue: SocialInsightsQueueService,
  ) {}

  async handle(data: unknown) {
    payload.parse(data);
    await this.queue.enqueueDueRefreshes();
  }
}
