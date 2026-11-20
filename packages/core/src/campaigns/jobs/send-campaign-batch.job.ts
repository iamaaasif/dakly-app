import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { JOB_POLL_INTERVAL_MS, MINUTE_MS } from '../../platform/time';
import { CampaignSenderService } from '../campaign-sender.service';
import { CampaignSweepService } from '../campaign-sweep.service';

export const SEND_CAMPAIGN_BATCH = 'send-campaign-batch';

const LEASE_MS = 5 * MINUTE_MS;
const leaseScript = `
  if ARGV[3] == 'take' then
    return redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')
  end
  if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
  if ARGV[3] == 'renew' then
    return redis.call('PEXPIRE', KEYS[1], ARGV[2])
  end
  return redis.call('DEL', KEYS[1])
`;

const payload = z.strictObject({ storeId: z.uuid(), lane: z.enum(['sending', 'cancelled']) });

@HandlesJob({ queue: QUEUES.campaign, name: SEND_CAMPAIGN_BATCH })
export class SendCampaignBatchJob implements JobHandler, OnModuleInit {
  constructor(
    @Inject(CampaignSenderService) private readonly sender: CampaignSenderService,
    @InjectQueue(QUEUES.campaign) private readonly queue: Queue,
    @Inject(CampaignSweepService) private readonly sweep: CampaignSweepService,
  ) {}

  async onModuleInit() {
    const client = await this.queue.client;
    client.defineCommand('campaignBatchLease', { numberOfKeys: 1, lua: leaseScript });
  }

  async handle(data: unknown) {
    const { storeId, lane } = payload.parse(data);
    const client = await this.queue.client;
    const key = this.queue.toKey(`batch-lease:${storeId}`);
    const token = randomUUID();
    const lease = (operation: 'take' | 'renew' | 'release') =>
      client.runCommand('campaignBatchLease', [key, token, LEASE_MS, operation]);
    let expiresAt = performance.now() + LEASE_MS;
    if (!(await lease('take'))) return { delayUntil: Date.now() + JOB_POLL_INTERVAL_MS };
    const heartbeat = setInterval(() => {
      const renewedUntil = performance.now() + LEASE_MS;
      void lease('renew').then(
        (renewed) => {
          expiresAt = renewed && expiresAt ? renewedUntil : 0;
        },
        () => {
          expiresAt = 0;
        },
      );
    }, JOB_POLL_INTERVAL_MS);
    try {
      const campaignId = await this.sweep.nextForLane(storeId, lane);
      if (!campaignId) return;
      const hasLease = () => performance.now() + MINUTE_MS < expiresAt;
      const next = await this.sender.sendBatch(storeId, campaignId, hasLease);
      if (next) return { delayUntil: next.getTime() };
    } finally {
      clearInterval(heartbeat);
      await lease('release');
    }
  }
}
