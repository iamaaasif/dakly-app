import { Inject, Injectable } from '@nestjs/common';

import { orderStageCounts } from './order-stage';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrderStageCountsService {
  constructor(@Inject(OrdersRepository) private readonly repository: OrdersRepository) {}

  async byStage(storeId: string) {
    return orderStageCounts(await this.repository.countByStage(storeId));
  }
}
