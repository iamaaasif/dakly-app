import { Inject, Injectable } from '@nestjs/common';

import { OrderAttributionService } from '../orders/order-attribution.service';
import { StoreTransaction } from '../platform/database/store-transaction';
import { StoresService } from '../stores/stores.service';
import { OrderAttributionEngine } from './order-attribution-engine.service';

const PAGE_SIZE = 25;
const ORDERS_PER_JOB = 500;

@Injectable()
export class AttributionRebuildService {
  constructor(
    @Inject(OrderAttributionEngine) private readonly engine: OrderAttributionEngine,
    @Inject(OrderAttributionService) private readonly orders: OrderAttributionService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  async runPage(storeId: string, rebuildId: string, checkpoint: string | null) {
    for (let page = 0; page < ORDERS_PER_JOB / PAGE_SIZE; page++) {
      if (!(await this.processPage(storeId, rebuildId, checkpoint))) return;
    }
  }

  private async processPage(storeId: string, rebuildId: string, checkpoint: string | null) {
    const { rebuild, windowDays } = await this.stores.attributionRebuild(storeId);
    if (!matchesJob(rebuild, rebuildId, checkpoint)) return false;
    const selections = await this.transaction.run(storeId, async () => {
      const orders = await this.orders.rebuildPage(storeId, { ...rebuild, limit: PAGE_SIZE });
      const page = [];
      for (const order of orders)
        page.push({ order, reference: await this.engine.select(storeId, order, windowDays) });
      return page;
    });
    return this.transaction.runLocked(storeId, async () => {
      const current = await this.stores.attributionRebuild(storeId);
      if (!matchesJob(current.rebuild, rebuildId, checkpoint)) return false;
      if (current.rebuild.processedOrders !== rebuild.processedOrders) return true;
      for (const { order, reference } of selections)
        await this.orders.rebuild(storeId, order.id, order, reference);

      const last = selections.at(-1)?.order;
      const after = selections.length === PAGE_SIZE && last ? { id: last.id, at: last.at } : null;
      const processedOrders = rebuild.processedOrders + selections.length;
      const atCheckpoint = processedOrders % ORDERS_PER_JOB === 0;
      await this.stores.saveAttributionRebuild(
        storeId,
        after && {
          ...rebuild,
          after,
          processedOrders,
          checkpoint: atCheckpoint ? after.id : checkpoint,
        },
      );
      return after !== null && !atCheckpoint;
    });
  }
}

function matchesJob<T extends { id: string; checkpoint: string | null }>(
  rebuild: T | null,
  rebuildId: string,
  checkpoint: string | null,
): rebuild is T {
  return rebuild?.id === rebuildId && rebuild.checkpoint === checkpoint;
}
