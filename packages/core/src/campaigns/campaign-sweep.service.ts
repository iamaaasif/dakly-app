import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { jobLogBindings } from '../platform/logging/job-context';
import { serializeError } from '../platform/logging/safe-error';
import { QUEUES } from '../platform/queue/queues';
import { DAY_MS, JOB_POLL_INTERVAL_MS } from '../platform/time';
import { CAMPAIGN_CLAIM_MS } from './campaign-sender.service';
import { CampaignSendingRepository } from './campaign-sending.repository';
import { SEND_CAMPAIGN_BATCH } from './jobs/send-campaign-batch.job';

const STORES_PER_TICK = 100;
const CURSOR_LIFETIME_SECONDS = (7 * DAY_MS) / 1000;
const STORE_CURSOR = 'campaign-start:store';
const MAX_WAITING_BATCHES = 200;

@Injectable()
export class CampaignSweepService {
  private readonly logger = new Logger(CampaignSweepService.name);
  constructor(
    @Inject(CampaignSendingRepository) private readonly repository: CampaignSendingRepository,
    @Inject(ErrorReporter) private readonly reporter: ErrorReporter,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ValkeyClient) private readonly valkey: ValkeyClient,
    @InjectQueue(QUEUES.campaign) private readonly queue: Queue<{ storeId: string }>,
  ) {}

  async startDue(): Promise<void> {
    const waiting = await this.queue.getWaitingCount();
    const limit = Math.min(STORES_PER_TICK, MAX_WAITING_BATCHES - waiting);
    if (limit <= 0) return;
    const now = this.clock.now();
    const after = await this.valkey.connection.get(STORE_CURSOR);
    let stores = await this.repository.listDueStores(now, after, limit);
    if (!stores.length && after) stores = await this.repository.listDueStores(now, null, limit);
    const batches: { storeId: string }[] = [];
    const before = new Date(now.getTime() - CAMPAIGN_CLAIM_MS);
    for (const storeId of stores) {
      try {
        await this.repository.startDueInStore(storeId, now);
        if (await this.repository.nextCampaignId(storeId, before)) batches.push({ storeId });
      } catch (error) {
        this.logger.error({ storeId }, 'Campaign starts failed for store');
        const { jobId } = jobLogBindings();
        if (jobId) this.reporter.reportJob(serializeError(error), jobId);
      }
    }
    if (batches.length) {
      await this.queue.addBulk(
        batches.map((data) => ({
          name: SEND_CAMPAIGN_BATCH,
          data,
          opts: {
            deduplication: { id: data.storeId },
            attempts: 3,
            backoff: { type: 'exponential', delay: JOB_POLL_INTERVAL_MS },
            removeOnComplete: true,
            removeOnFail: 100,
          },
        })),
      );
    }
    const last = stores.at(-1);
    if (last) await this.valkey.connection.set(STORE_CURSOR, last, 'EX', CURSOR_LIFETIME_SECONDS);
  }
}
