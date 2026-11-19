import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import type { ScheduledPostTarget } from '@dakly/contracts/social';
import type { MetaPublishingDriver } from '@dakly/providers/social/meta-publishing-driver';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, MINUTE_MS } from '../platform/time';
import { StoresService } from '../stores/stores.service';
import { META_PUBLISHING_DRIVER } from './social-publishing.service';
import { SocialRepository } from './social.repository';

export const PUBLISH_POST_TARGET = 'publish-post-target';
export const CHECK_POST_TARGET = 'check-post-target';
const BATCH_SIZE = 100;
const retryDelay = Math.floor((30 * MINUTE_MS) / 7);

@Injectable()
export class SocialPublishingQueueService implements OnApplicationBootstrap {
  constructor(
    @Inject(SocialRepository) private readonly repository: SocialRepository,
    @Inject(META_PUBLISHING_DRIVER) private readonly driver: MetaPublishingDriver | null,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoresService) private readonly stores: StoresService,
    @InjectQueue(QUEUES.outbound) private readonly queue: Queue<ScheduledPostTarget>,
  ) {}

  async onApplicationBootstrap() {
    if (!this.driver) return;
    let after: string | null = null;
    // The relay may have already marked events from before publishing was deployed as sent.
    for (;;) {
      const stores = await this.stores.maintenanceStoreIds(after, BATCH_SIZE);
      for (const storeId of stores) {
        if (await this.stores.isActive(storeId)) await this.restoreJobs(storeId);
      }
      if (stores.length < BATCH_SIZE) return;
      after = stores.at(-1) ?? null;
    }
  }

  async enqueueTarget(storeId: string, input: Omit<ScheduledPostTarget, 'storeId'>) {
    if (!this.driver) return;
    const data = { storeId, ...input };
    const scheduled = Date.parse(input.scheduledFor);
    const remaining = scheduled - this.clock.now().getTime();
    const jobId = `${input.postTargetId}-${scheduled}`;
    return this.queue.addBulk([
      {
        name: CHECK_POST_TARGET,
        data,
        opts: {
          jobId: `check-${jobId}`,
          delay: Math.max(0, remaining - DAY_MS),
          attempts: 3,
          backoff: { type: 'exponential', delay: MINUTE_MS },
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
    ]);
  }

  private async restoreJobs(storeId: string) {
    let after: string | undefined;
    for (;;) {
      const rows = await this.repository.pendingPublishTargets(storeId, after, BATCH_SIZE);
      for (const row of rows) {
        if (!row.scheduledFor) continue;
        const jobs = await this.enqueueTarget(storeId, {
          postTargetId: row.id,
          scheduledFor: row.scheduledFor.toISOString(),
        });
        for (const job of jobs ?? []) await this.retryFailed(job);
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
      // A second worker can restore the same job during startup.
      if (await job.isFailed()) throw failure;
    }
  }
}
