import { Inject, Injectable } from '@nestjs/common';

import { OrderAttributionService } from '../orders/order-attribution.service';
import { StoreTransaction } from '../platform/database/store-transaction';
import { StoresService } from '../stores/stores.service';
import { OrderAttributionEngine } from './order-attribution-engine.service';

const PAGE_SIZE = 25;

@Injectable()
export class AttributionRebuildService {
  constructor(
    @Inject(OrderAttributionEngine) private readonly engine: OrderAttributionEngine,
    @Inject(OrderAttributionService) private readonly orders: OrderAttributionService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  async runPage(storeId: string, rebuildId: string, afterOrderId: string | null) {
    const { rebuild, windowDays } = await this.stores.attributionRebuild(storeId);
    if (!matchesPage(rebuild, rebuildId, afterOrderId)) return;
    const selections = await this.transaction.run(storeId, async () => {
      const orders = await this.orders.rebuildPage(storeId, { ...rebuild, limit: PAGE_SIZE });
      const page = [];
      for (const order of orders)
        page.push({ order, reference: await this.engine.select(storeId, order, windowDays) });
      return page;
    });
    await this.transaction.runLocked(storeId, async () => {
      const current = await this.stores.attributionRebuild(storeId);
      if (!matchesPage(current.rebuild, rebuildId, afterOrderId)) return;
      for (const { order, reference } of selections)
        await this.orders.rebuild(storeId, order.id, order, reference);

      const last = selections.at(-1)?.order;
      const after = selections.length === PAGE_SIZE && last ? { id: last.id, at: last.at } : null;
      await this.stores.saveAttributionRebuild(
        storeId,
        after && {
          ...rebuild,
          after,
          processedOrders: rebuild.processedOrders + selections.length,
        },
      );
    });
  }
}

function matchesPage<T extends { id: string; after: { id: string } | null }>(
  rebuild: T | null,
  rebuildId: string,
  afterOrderId: string | null,
): rebuild is T {
  return rebuild?.id === rebuildId && (rebuild.after?.id ?? null) === afterOrderId;
}
