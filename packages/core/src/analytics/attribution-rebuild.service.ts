import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';

import { OrderAttributionService } from '../orders/order-attribution.service';
import { StoreTransaction } from '../platform/database/store-transaction';
import { QUEUES } from '../platform/queue/queues';
import { StoresService } from '../stores/stores.service';
import { OrderAttributionEngine } from './order-attribution-engine.service';

const PAGE_SIZE = 25;
export const REBUILD_ATTRIBUTION = 'rebuild-attribution';
export const rebuildAttributionSchema = z.strictObject({ storeId: z.uuid(), rebuildId: z.uuid() });

@Injectable()
export class AttributionRebuildService {
  constructor(
    @Inject(OrderAttributionEngine) private readonly engine: OrderAttributionEngine,
    @Inject(OrderAttributionService) private readonly orders: OrderAttributionService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(StoresService) private readonly stores: StoresService,
    @InjectQueue(QUEUES.bulk) private readonly queue: Queue,
  ) {}

  async runPage(storeId: string, rebuildId: string) {
    const next = await this.transaction.runLocked(storeId, async () => {
      const { windowDays, rebuild } = await this.stores.attributionRebuild(storeId);
      if (rebuild?.id !== rebuildId) return null;
      const page = await this.orders.rebuildPage(storeId, { ...rebuild, limit: PAGE_SIZE });
      for (const { id } of page) await this.engine.attribute(storeId, id, windowDays);
      const after = page.length === PAGE_SIZE ? (page.at(-1) ?? null) : null;
      await this.stores.saveAttributionRebuild(
        storeId,
        after && { ...rebuild, after, processedOrders: rebuild.processedOrders + page.length },
      );
      return after;
    });
    if (next)
      await this.queue.add(
        REBUILD_ATTRIBUTION,
        { storeId, rebuildId },
        {
          jobId: `attribution-${rebuildId}-${next.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
        },
      );
  }
}
