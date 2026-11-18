import { Inject, Injectable, Logger } from '@nestjs/common';

import { ValkeyClient } from '../platform/cache/valkey-client';
import { Clock } from '../platform/clock';
import { ErrorReporter } from '../platform/logging/error-reporter';
import { jobLogBindings } from '../platform/logging/job-context';
import { serializeError } from '../platform/logging/safe-error';
import { DAY_MS } from '../platform/time';
import { CampaignSendingRepository } from './campaign-sending.repository';

const STORES_PER_TICK = 100;
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
    for (const storeId of stores) {
      await this.repository.startDueInStore(storeId, now).catch((error: unknown) => {
        this.logger.error({ storeId }, 'Campaign starts failed for store');
        const { jobId } = jobLogBindings();
        if (jobId) this.reporter.reportJob(serializeError(error), jobId);
      });
    }
    const last = stores.at(-1);
    if (last) await this.valkey.connection.set(STORE_CURSOR, last, 'EX', CURSOR_LIFETIME_SECONDS);
  }
}
