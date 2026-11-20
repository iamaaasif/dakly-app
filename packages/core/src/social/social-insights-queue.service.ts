import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../platform/time';
import { REFRESH_POST_METRICS } from './jobs/refresh-post-metrics.job';
import { SocialPublishRecoveryRepository } from './social-publish-recovery.repository';

const BATCH_SIZE = 500;
// Meta rate limits clear slowly, so the first retry waits five minutes.
const RETRY_DELAY_MS = 5 * MINUTE_MS;

@Injectable()
export class SocialInsightsQueueService {
  constructor(
    @Inject(SocialPublishRecoveryRepository)
    private readonly due: SocialPublishRecoveryRepository,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.sync) private readonly queue: Queue,
  ) {}

  async enqueueDueRefreshes() {
    const targets = await this.due.dueMetricsTargets(BATCH_SIZE);
    if (!targets.length) return;
    const hour = Math.floor(this.clock.now().getTime() / HOUR_MS);
    await this.queue.addBulk(
      targets.map((data) => ({
        name: REFRESH_POST_METRICS,
        data,
        // One job per target and hour: a sweep that overlaps the last one adds nothing.
        opts: {
          jobId: `${REFRESH_POST_METRICS}-${data.postTargetId}-${hour}`,
          attempts: 4,
          backoff: { type: 'exponential', delay: RETRY_DELAY_MS },
          removeOnComplete: { age: DAY_MS / 1_000 },
          removeOnFail: 100,
        },
      })),
    );
  }
}
