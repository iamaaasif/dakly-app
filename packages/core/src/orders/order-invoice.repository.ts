import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { orderItems, orders } from '@dakly/db/schema/orders';

import { TenantDatabase } from '../platform/database/tenant-database';

@Injectable()
export class OrderInvoiceRepository {
  constructor(@Inject(TenantDatabase) private readonly tenant: TenantDatabase) {}

  find(storeId: string, orderId: string) {
    return this.tenant.forStore(storeId, (tx) =>
      tx
        .select({
          order: {
            number: orders.number,
            createdAt: orders.createdAt,
            buyerName: orders.buyerName,
            recipientName: orders.recipientName,
            recipientPhone: orders.recipientPhone,
            recipientAddress: orders.recipientAddress,
            recipientDistrict: orders.recipientDistrict,
            itemsSubtotalPoisha: orders.itemsSubtotalPoisha,
            deliveryChargePoisha: orders.deliveryChargePoisha,
            orderDiscountPoisha: orders.orderDiscountPoisha,
            advancePaidPoisha: orders.advancePaidPoisha,
            codAmountPoisha: orders.codAmountPoisha,
            deliveredItemsSubtotalPoisha: orders.deliveredItemsSubtotalPoisha,
            deliveredOrderDiscountPoisha: orders.deliveredOrderDiscountPoisha,
          },
          item: {
            id: orderItems.id,
            productName: orderItems.productName,
            variantTitle: orderItems.variantTitle,
            quantity: orderItems.quantity,
            unitPricePoisha: orderItems.unitPricePoisha,
            lineDiscountPoisha: orderItems.lineDiscountPoisha,
            deliveredQuantity: orderItems.deliveredQuantity,
            deliveredLineDiscountPoisha: orderItems.deliveredLineDiscountPoisha,
          },
        })
        .from(orders)
        .leftJoin(
          orderItems,
          and(eq(orderItems.orderId, orders.id), eq(orderItems.storeId, storeId)),
        )
        .where(and(eq(orders.storeId, storeId), eq(orders.id, orderId)))
        .orderBy(orderItems.variantId, orderItems.id),
    );
  }
}
