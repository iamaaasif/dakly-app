import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { Clock } from '../platform/clock';
import { QUEUES } from '../platform/queue/queues';
import { JOB_POLL_INTERVAL_MS, MINUTE_MS } from '../platform/time';
import { type ApprovalKey, CampaignApprovalRepository } from './campaign-approval.repository';
import { BUILD_CAMPAIGN_AUDIENCE } from './jobs/build-campaign-audience.job';

// The job moves the cursor on every page; this long without a move means the job was lost.
const STALLED_MS = 5 * MINUTE_MS;
const STALLED_PER_SWEEP = 100;

@Injectable()
export class CampaignApprovalQueueService {
  constructor(
    @Inject(CampaignApprovalRepository) private readonly approvals: CampaignApprovalRepository,
    @Inject(Clock) private readonly clock: Clock,
    @InjectQueue(QUEUES.campaign) private readonly queue: Queue,
  ) {}

  // One approval has one job at a time: a second add while the first exists changes nothing.
  async enqueue(storeId: string, { id, approvedAt }: ApprovalKey): Promise<void> {
    await this.queue.add(
      BUILD_CAMPAIGN_AUDIENCE,
      { storeId, campaignId: id, approvedAt: approvedAt.toISOString() },
      {
        deduplication: { id: `${id}-${approvedAt.getTime()}` },
        attempts: 3,
        backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  // Covers a job lost after it started, for example a Valkey flush. The first enqueue comes
  // from the outbox event.
  async requeueStalled(): Promise<void> {
    const before = new Date(this.clock.now().getTime() - STALLED_MS);
    for (const { storeId, ...key } of await this.approvals.listStalled(before, STALLED_PER_SWEEP))
      await this.enqueue(storeId, key);
  }
}
