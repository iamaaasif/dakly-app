import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import type { ScheduledPostTarget } from '@dakly/contracts/social';
import type { MetaPublishingDriver } from '@dakly/providers/social/meta-publishing-driver';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { CHECK_POST_TARGET } from './jobs/check-post-target.job';
import { PUBLISH_POST_TARGET } from './jobs/publish-post-target.job';
import { SocialPublishRecoveryRepository } from './social-publish-recovery.repository';
import { META_PUBLISHING_DRIVER } from './social-publishing.service';
import { SocialRepository } from './social.repository';

const BATCH_SIZE = 100;
const retryDelay = Math.floor((30 * MINUTE_MS) / 7);

@Injectable()
export class SocialPublishingQueueService {
  constructor(
    @Inject(SocialRepository) private readonly repository: SocialRepository,
    @Inject(SocialPublishRecoveryRepository)
    private readonly recovery: SocialPublishRecoveryRepository,
    @Inject(META_PUBLISHING_DRIVER) private readonly driver: MetaPublishingDriver | null,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.outbound) private readonly queue: Queue<ScheduledPostTarget>,
  ) {}

  async recoverDueTargets() {
    if (!this.driver) return;
    const before = new Date(this.clock.now().getTime() + DAY_MS);
    const failedIds = new Set((await this.queue.getFailed()).map(({ id }) => id));
    let after: string | null = null;
    for (;;) {
      const stores = await this.recovery.dueStoreIds(before, after, BATCH_SIZE);
      for (const storeId of stores) await this.restoreJobs(storeId, before, failedIds);
      if (stores.length < BATCH_SIZE) return;
      after = stores.at(-1) ?? null;
    }
  }

  async enqueueTarget(storeId: string, input: Omit<ScheduledPostTarget, 'storeId'>) {
    if (!this.driver) return;
    await this.queue.addBulk(this.jobsFor({ storeId, ...input }));
  }

  private jobsFor(data: ScheduledPostTarget) {
    const scheduled = Date.parse(data.scheduledFor);
    const remaining = scheduled - this.clock.now().getTime();
    const jobId = `${data.postTargetId}-${scheduled}`;
    return [
      {
        name: CHECK_POST_TARGET,
        data,
        opts: {
          jobId: `check-${jobId}`,
          delay: Math.max(0, remaining - DAY_MS),
          attempts: 3,
          removeOnComplete: { age: DAY_MS / 1_000 },
          removeOnFail: 100,
        },
      },
      {
        name: PUBLISH_POST_TARGET,
        data,
        opts: {
          jobId: `publish-${jobId}`,
          delay: Math.max(0, remaining),
          attempts: 4,
          backoff: { type: 'exponential', delay: retryDelay },
          removeOnComplete: true,
          removeOnFail: 100,
        },
      },
    ];
  }

  private async restoreJobs(storeId: string, before: Date, failedIds: Set<string | undefined>) {
    let after: string | undefined;
    for (;;) {
      const rows = await this.repository.pendingPublishTargets(storeId, before, after, BATCH_SIZE);
      const planned = rows.flatMap(({ id, scheduledFor }) =>
        scheduledFor
          ? this.jobsFor({ storeId, postTargetId: id, scheduledFor: scheduledFor.toISOString() })
          : [],
      );
      const jobs = planned.length ? await this.queue.addBulk(planned) : [];
      for (const failed of jobs.filter(({ id }) => failedIds.has(id))) {
        await this.retryFailed(failed);
      }
      if (rows.length < BATCH_SIZE) return;
      after = rows.at(-1)?.id;
    }
  }

  private async retryFailed(job: Job<ScheduledPostTarget>) {
    if (!(await job.isFailed())) return;
    try {
      await job.retry('failed', { resetAttemptsMade: true, resetAttemptsStarted: true });
    } catch (failure) {
      // Overlapping sweeps can restore the same job.
      if (await job.isFailed()) throw failure;
    }
  }
}
