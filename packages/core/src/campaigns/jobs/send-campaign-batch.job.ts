import { randomUUID } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';

import { HandlesJob, type JobHandler } from '../../platform/queue/job-handler';
import { QUEUES } from '../../platform/queue/queues';
import { JOB_POLL_INTERVAL_MS, MINUTE_MS } from '../../platform/time';
import { CampaignSenderService } from '../campaign-sender.service';

export const SEND_CAMPAIGN_BATCH = 'send-campaign-batch';

const LEASE_MS = 5 * MINUTE_MS;
const acquire = `return redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')`;
const release = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

const payload = z.strictObject({ storeId: z.uuid(), campaignId: z.uuid() });

@HandlesJob({ queue: QUEUES.campaign, name: SEND_CAMPAIGN_BATCH })
export class SendCampaignBatchJob implements JobHandler, OnModuleInit {
  private readonly logger = new Logger(SendCampaignBatchJob.name);

  constructor(
    @Inject(CampaignSenderService) private readonly sender: CampaignSenderService,
    @InjectQueue(QUEUES.campaign) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    const client = await this.queue.client;
    client.defineCommand('claimCampaignBatch', { numberOfKeys: 1, lua: acquire });
    client.defineCommand('releaseCampaignBatch', { numberOfKeys: 1, lua: release });
  }

  async handle(data: unknown) {
    const { storeId, campaignId } = payload.parse(data);
    const client = await this.queue.client;
    const key = this.queue.toKey(`batch-lease:${storeId}`);
    const token = randomUUID();
    if (!(await client.runCommand('claimCampaignBatch', [key, token, LEASE_MS])))
      return { delayUntil: Date.now() + JOB_POLL_INTERVAL_MS };
    try {
      const next = await this.sender.sendBatch(storeId, campaignId);
      if (next) return { delayUntil: next.getTime() };
    } finally {
      await client.runCommand('releaseCampaignBatch', [key, token]).catch(() => {
        this.logger.warn('Could not release a campaign batch lease');
      });
    }
  }
}
