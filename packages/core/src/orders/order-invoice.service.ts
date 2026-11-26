import { Inject, Injectable } from '@nestjs/common';

import type { OrderInvoice } from '@dakly/contracts/order-invoice';
import { maskPhone } from '@dakly/contracts/phone';

import { StoresService } from '../stores/stores.service';
import { OrderInvoiceRepository } from './order-invoice.repository';
import { orderError } from './orders.errors';

@Injectable()
export class OrderInvoiceService {
  constructor(
    @Inject(OrderInvoiceRepository) private readonly repository: OrderInvoiceRepository,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  async read(storeId: string, orderId: string, seeFullPhone: boolean): Promise<OrderInvoice> {
    const rows = await this.repository.find(storeId, orderId);
    const order = rows[0]?.order;
    if (!order) throw orderError('ORDER_NOT_FOUND');
    const {
      createdAt,
      recipientPhone,
      deliveredItemsSubtotalPoisha,
      deliveredOrderDiscountPoisha,
      ...snapshot
    } = order;
    return {
      ...snapshot,
      store: await this.stores.contactDetails(storeId),
      createdAt: createdAt.toISOString(),
      recipientPhone: seeFullPhone || !recipientPhone ? recipientPhone : maskPhone(recipientPhone),
      itemsSubtotalPoisha: deliveredItemsSubtotalPoisha ?? snapshot.itemsSubtotalPoisha,
      orderDiscountPoisha: deliveredOrderDiscountPoisha ?? snapshot.orderDiscountPoisha,
      isPartialDelivery: rows.some(({ item }) => item !== null && item.deliveredQuantity !== null),
      items: rows.flatMap(({ item }) => {
        if (!item) return [];
        const { deliveredQuantity, deliveredLineDiscountPoisha, ...line } = item;
        return [
          {
            ...line,
            quantity: deliveredQuantity ?? line.quantity,
            lineDiscountPoisha: deliveredLineDiscountPoisha ?? line.lineDiscountPoisha,
          },
        ];
      }),
    };
  }
}
