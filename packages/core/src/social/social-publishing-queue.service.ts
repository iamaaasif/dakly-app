import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import type { ScheduledPostTarget } from '@dakly/contracts/social';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { CHECK_POST_TARGET } from './jobs/check-post-target.job';
import { PUBLISH_POST_TARGET } from './jobs/publish-post-target.job';
import { SocialPublishRecoveryRepository } from './social-publish-recovery.repository';
import { SocialPublishingService } from './social-publishing.service';
import { SocialRepository } from './social.repository';

const BATCH_SIZE = 100;
const RETRY_WINDOW_MS = 30 * MINUTE_MS;
// Three exponential retries use 1 + 2 + 4 units of delay.
const retryDelay = Math.floor(RETRY_WINDOW_MS / 7);

@Injectable()
export class SocialPublishingQueueService {
  constructor(
    @Inject(SocialRepository) private readonly repository: SocialRepository,
    @Inject(SocialPublishRecoveryRepository)
    private readonly recovery: SocialPublishRecoveryRepository,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(SocialPublishingService) private readonly publishing: SocialPublishingService,
    @InjectQueue(QUEUES.outbound) private readonly queue: Queue<ScheduledPostTarget>,
  ) {}

  async recoverDueTargets() {
    const before = new Date(this.clock.now().getTime() + DAY_MS);
    let after: string | null = null;
    for (;;) {
      const stores = await this.recovery.dueStoreIds(before, after, BATCH_SIZE);
      for (const storeId of stores) await this.restoreJobs(storeId, before);
      if (stores.length < BATCH_SIZE) return;
      after = stores.at(-1) ?? null;
    }
  }

  async enqueueTargets(storeId: string, inputs: Omit<ScheduledPostTarget, 'storeId'>[]) {
    const planned = inputs.flatMap((input) => this.jobsFor({ storeId, ...input }));
    const now = this.clock.now().getTime();
    const timely = planned.filter((job) => this.deadline(job) > now);
    const expired = planned.filter(
      (job) => job.name === PUBLISH_POST_TARGET && this.deadline(job) <= now,
    );
    const jobs = timely.length ? await this.queue.addBulk(timely) : [];
    const failed = await Promise.all(jobs.map((job) => job.isFailed()));
    for (const [index, job] of jobs.entries()) {
      if (failed[index]) await this.retryFailed(job);
    }
    for (const { data, opts } of expired) {
      const state = await this.queue.getJobState(opts.jobId);
      if (state === 'failed' || state === 'unknown' || state === 'completed') {
        const { postTargetId, scheduledFor } = data;
        await this.publishing.settleExpiredTarget(storeId, { postTargetId, scheduledFor });
      }
    }
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

  private async restoreJobs(storeId: string, before: Date) {
    let after: string | undefined;
    for (;;) {
      const rows = await this.repository.pendingPublishTargets(storeId, before, after, BATCH_SIZE);
      const targets = rows.flatMap(({ id, scheduledFor }) =>
        scheduledFor ? [{ postTargetId: id, scheduledFor: scheduledFor.toISOString() }] : [],
      );
      await this.enqueueTargets(storeId, targets);
      if (rows.length < BATCH_SIZE) return;
      after = rows.at(-1)?.id;
    }
  }

  private deadline({ name, data }: { name: string; data: ScheduledPostTarget }) {
    return Date.parse(data.scheduledFor) + (name === PUBLISH_POST_TARGET ? RETRY_WINDOW_MS : 0);
  }

  private async retryFailed(job: Job<ScheduledPostTarget>) {
    if (this.clock.now().getTime() >= this.deadline(job)) return;
    try {
      await job.retry('failed');
    } catch (failure) {
      // Overlapping sweeps can restore the same job.
      if (await job.isFailed()) throw failure;
    }
  }
}
