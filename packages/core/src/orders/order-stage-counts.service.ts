import { Inject, Injectable } from '@nestjs/common';

import { orderStageCounts } from './order-stage';
import { OrderStageCountsRepository } from './order-stage-counts.repository';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrderStageCountsService {
  constructor(
    @Inject(OrdersRepository) private readonly repository: OrdersRepository,
    @Inject(OrderStageCountsRepository) private readonly pending: OrderStageCountsRepository,
  ) {}

  async byStage(storeId: string) {
    return orderStageCounts(await this.repository.countByStage(storeId));
  }

  // Orders waiting for an advance payment, in any stage that is still open.
  awaitingAdvance(storeId: string): Promise<number> {
    return this.pending.countAwaitingAdvance(storeId);
  }
}
