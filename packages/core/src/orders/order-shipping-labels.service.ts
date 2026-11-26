import { Inject, Injectable } from '@nestjs/common';

import type { OrderShippingLabels } from '@dakly/contracts/order-shipping-labels';
import { maskPhone } from '@dakly/contracts/phone';

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
    const rows = await this.repository.find(storeId, orderIds);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const labels = orderIds.map((id) => {
      const row = byId.get(id);
      if (!row) throw orderError('ORDER_NOT_FOUND');
      const { recipientPhone, paymentStatus, codAmountPoisha, ...label } = row;
      return {
        ...label,
        recipientPhone:
          seeFullPhone || !recipientPhone ? recipientPhone : maskPhone(recipientPhone),
        codDuePoisha:
          paymentStatus === 'paid' || paymentStatus === 'cod_collected' ? 0 : codAmountPoisha,
      };
    });
    const { name, phone } = await this.stores.contactDetails(storeId);
    return { store: { name, phone }, labels };
  }
}
