import { Inject, Injectable } from '@nestjs/common';

import type { OrderShippingLabels } from '@dakly/contracts/order-shipping-labels';

import { StoresService } from '../stores/stores.service';
import { OrderShippingLabelsRepository } from './order-shipping-labels.repository';
import { orderError } from './orders.errors';

@Injectable()
export class OrderShippingLabelsService {
  constructor(
    @Inject(OrderShippingLabelsRepository)
    private readonly repository: OrderShippingLabelsRepository,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  async read(
    storeId: string,
    orderIds: string[],
    seeFullPhone: boolean,
  ): Promise<OrderShippingLabels> {
    if (!seeFullPhone) throw orderError('ORDER_SHIPPING_LABELS_PHONE_REQUIRED');
    const rows = await this.repository.find(storeId, orderIds);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const labels = orderIds.map((id) => {
      const row = byId.get(id);
      if (!row) throw orderError('ORDER_NOT_FOUND');
      const { stage, paymentStatus, codAmountPoisha, codCollectedPoisha, ...label } = row;
      const skipCodCollection =
        stage === 'returned' || stage === 'cancelled' || paymentStatus === 'paid';
      return {
        ...label,
        codDuePoisha: skipCodCollection
          ? 0
          : Math.max(0, codAmountPoisha - (codCollectedPoisha ?? 0)),
      };
    });
    const { name, phone } = await this.stores.contactDetails(storeId);
    return { store: { name, phone }, labels };
  }
}
