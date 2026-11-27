import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { StoresService } from '../stores/stores.service';
import { OrderProductSalesRepository } from './order-product-sales.repository';

@Injectable()
export class OrderProductSalesService {
  constructor(
    @Inject(OrderProductSalesRepository) private readonly sales: OrderProductSalesRepository,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  async recentUnits(storeId: string) {
    const through = this.clock.now();
    const timeZone = await this.stores.timeZone(storeId);
    return this.sales.unitsByVariant(storeId, {
      timeZone,
      through,
      days: 30,
      excluded: ['cancelled', 'returned'],
    });
  }

  unitsToConfirm(storeId: string, variantIds: string[]) {
    return this.sales.unitsToConfirm(storeId, variantIds);
  }
}
