import { Inject, Injectable, Logger } from '@nestjs/common';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { jobLogBindings } from '../platform/logging/job-context';
import { serializeError } from '../platform/logging/safe-error';
import { DAY_MS } from '../platform/time';
import { CAMPAIGN_CLAIM_MS } from './campaign-sender.service';
import { CampaignSendingRepository } from './campaign-sending.repository';

const STORES_PER_TICK = 100;
const CURSOR_LIFETIME_SECONDS = (7 * DAY_MS) / 1000;
const STORE_CURSOR = 'campaign-start:store';
const MAX_WAITING_BATCHES = 200;

export type CampaignBatch = { storeId: string; lane: 'sending' | 'cancelled' };

@Injectable()
export class CampaignSweepService {
  private readonly logger = new Logger(CampaignSweepService.name);
  constructor(
    @Inject(CampaignSendingRepository) private readonly repository: CampaignSendingRepository,
    @Inject(ErrorReporter) private readonly reporter: ErrorReporter,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ValkeyClient) private readonly valkey: ValkeyClient,
  ) {}

  async nextForLane(storeId: string, lane: CampaignBatch['lane']) {
    const expired = new Date(this.clock.now().getTime() - CAMPAIGN_CLAIM_MS);
    const work = await this.repository.firstWork(storeId, expired);
    return work.find(({ status }) => status === lane)?.campaignId;
  }

  async startDue(
    waiting = 0,
    enqueue: (batches: CampaignBatch[]) => Promise<void> = async () => undefined,
  ): Promise<void> {
    const limit = Math.min(STORES_PER_TICK, Math.floor((MAX_WAITING_BATCHES - waiting) / 2));
    if (limit <= 0) return;
    const now = this.clock.now();
    const after = await this.valkey.connection.get(STORE_CURSOR);
    let stores = await this.repository.listDueStores(now, after, limit);
    if (!stores.length && after) stores = await this.repository.listDueStores(now, null, limit);
    const batches: CampaignBatch[] = [];
    const before = new Date(now.getTime() - CAMPAIGN_CLAIM_MS);
    for (const storeId of stores) {
      try {
        await this.repository.startDueInStore(storeId, now);
        const work = await this.repository.firstWork(storeId, before);
        batches.push(...work.map(({ status: lane }) => ({ storeId, lane })));
      } catch (error) {
        this.logger.error({ storeId }, 'Campaign starts failed for store');
        const { jobId } = jobLogBindings();
        if (jobId) this.reporter.reportJob(serializeError(error), jobId);
      }
    }
    await enqueue(batches);
    const last = stores.at(-1);
    if (last) await this.valkey.connection.set(STORE_CURSOR, last, 'EX', CURSOR_LIFETIME_SECONDS);
  }
}
