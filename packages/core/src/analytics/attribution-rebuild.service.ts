import { Inject, Injectable } from '@nestjs/common';

import { OrderAttributionService } from '../orders/order-attribution.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { OutboxService } from '../platform/outbox/outbox.service';
import { StoresService } from '../stores/stores.service';
import { OrderAttributionEngine } from './order-attribution-engine.service';

const PAGE_SIZE = 25;
const ORDERS_PER_JOB = 2000;

@Injectable()
export class AttributionRebuildService {
  constructor(
    @Inject(OrderAttributionEngine) private readonly engine: OrderAttributionEngine,
    @Inject(OrderAttributionService) private readonly orders: OrderAttributionService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(StoresService) private readonly stores: StoresService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async runPage(storeId: string, rebuildId: string, checkpoint: string | null) {
    let retries = 0;
    for (let page = 0; page < ORDERS_PER_JOB / PAGE_SIZE;) {
      try {
        if (!(await this.processPage(storeId, rebuildId, checkpoint))) return;
        page++;
        retries = 0;
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'ORDER_CHANGED' || ++retries === 3)
          throw error;
      }
    }
  }

  private async processPage(storeId: string, rebuildId: string, checkpoint: string | null) {
    const { rebuild, windowDays } = await this.stores.attributionRebuild(storeId);
    if (!matchesJob(rebuild, rebuildId, checkpoint)) return false;
    const orders = await this.orders.rebuildPage(storeId, { ...rebuild, limit: PAGE_SIZE });
    const selections = await this.engine.selectForOrders(storeId, orders, windowDays);
    return this.transaction.runLocked(storeId, async () => {
      const current = await this.stores.attributionRebuild(storeId);
      if (!matchesJob(current.rebuild, rebuildId, checkpoint)) return false;
      if (current.rebuild.processedOrders !== rebuild.processedOrders) return true;
      await this.orders.rebuild(storeId, selections);

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
      await this.refreshReports(
        storeId,
        selections.map(({ order }) => order.id),
      );
      return after !== null && !atCheckpoint;
    });
  }

  private async refreshReports(storeId: string, orderIds: string[]) {
    if (!orderIds.length) return;
    await this.outbox.publish({
      type: 'attribution.orders_rebuilt',
      storeId,
      occurredAt: this.clock.now().toISOString(),
      payload: { orderIds },
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
