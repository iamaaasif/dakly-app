import { Inject, Injectable, Logger } from '@nestjs/common';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { jobLogBindings } from '../platform/logging/job-context';
import { serializeError } from '../platform/logging/safe-error';
import { DAY_MS } from '../platform/time';
import { CampaignSendingRepository } from './campaign-sending.repository';

// One worker tick has finite room; store turns share it when many campaigns are due.
const STORES_PER_TICK = 100;
const CAMPAIGNS_PER_STORE = 2;
const CURSOR_LIFETIME_SECONDS = (7 * DAY_MS) / 1000;
const STORE_CURSOR = 'campaign-start:store';

@Injectable()
export class CampaignSenderService {
  private readonly logger = new Logger(CampaignSenderService.name);

  constructor(
    @Inject(CampaignSendingRepository) private readonly repository: CampaignSendingRepository,
    @Inject(ErrorReporter) private readonly reporter: ErrorReporter,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ValkeyClient) private readonly valkey: ValkeyClient,
  ) {}

  async startDue(): Promise<void> {
    const now = this.clock.now();
    const after = await this.valkey.connection.get(STORE_CURSOR);
    let stores = await this.repository.listDueStores(now, after, STORES_PER_TICK);
    if (!stores.length && after)
      stores = await this.repository.listDueStores(now, null, STORES_PER_TICK);
    for (const storeId of stores) await this.startStorePage(storeId, now);
    const last = stores.at(-1);
    if (last) await this.saveCursor(STORE_CURSOR, last);
  }

  private async startStorePage(storeId: string, asOf: Date): Promise<void> {
    const key = `campaign-start:campaign:${storeId}`;
    const after = await this.valkey.connection.get(key);
    let page = await this.repository.listDueInStore(storeId, {
      asOf,
      after,
      limit: CAMPAIGNS_PER_STORE,
    });
    if (!page.length && after)
      page = await this.repository.listDueInStore(storeId, {
        asOf,
        after: null,
        limit: CAMPAIGNS_PER_STORE,
      });
    for (const { campaignId } of page) {
      // Move past a locked or failed row this tick. A later pass can try it again.
      await this.repository.start(storeId, campaignId, asOf).catch((error: unknown) => {
        this.logger.error({ storeId, campaignId }, 'Campaign start failed');
        const { jobId } = jobLogBindings();
        if (jobId) this.reporter.reportJob(serializeError(error), jobId);
      });
    }
    const last = page.at(-1);
    if (last) await this.saveCursor(key, last.campaignId);
  }

  private async saveCursor(key: string, value: string): Promise<void> {
    await this.valkey.connection.set(key, value, 'EX', CURSOR_LIFETIME_SECONDS);
  }
}
