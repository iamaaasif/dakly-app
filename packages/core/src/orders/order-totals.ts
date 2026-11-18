import type { OrderDetail, OrderItem } from '@dakly/contracts/orders';

import { orderError } from './orders.errors';
import type { OrderItemWrite } from './orders.repository';

export function orderTotals(
  items: OrderItemWrite[],
  {
    orderDiscountPoisha,
    deliveryChargePoisha,
    advancePaidPoisha,
  }: {
    orderDiscountPoisha: number;
    deliveryChargePoisha: number;
    advancePaidPoisha: number;
  },
) {
  const subtotal = items.reduce((sum, item) => {
    const net =
      BigInt(item.quantity) * BigInt(item.unitPricePoisha) - BigInt(item.lineDiscountPoisha ?? 0);
    if (net < 0n) throw orderError('ORDER_TOTAL_INVALID');
    return sum + net;
  }, 0n);
  const cod =
    subtotal -
    BigInt(orderDiscountPoisha) +
    BigInt(deliveryChargePoisha) -
    BigInt(advancePaidPoisha);
  if (subtotal > Number.MAX_SAFE_INTEGER || cod > Number.MAX_SAFE_INTEGER)
    throw orderError('ORDER_TOTAL_INVALID');
  return {
    itemsSubtotalPoisha: Number(subtotal),
    orderDiscountPoisha,
    advancePaidPoisha,
    codAmountPoisha: cod > 0n ? Number(cod) : 0,
  };
}

export function partialOrderTotals(
  ordered: Pick<
    OrderDetail,
    'itemsSubtotalPoisha' | 'orderDiscountPoisha' | 'deliveryChargePoisha' | 'advancePaidPoisha'
  >,
  delivered: {
    item: Pick<OrderItem, 'id' | 'quantity' | 'unitPricePoisha' | 'lineDiscountPoisha'>;
    quantity: number;
  }[],
) {
  let subtotal = 0n;
  const lines = delivered.map(({ item, quantity }) => {
    const discount = (BigInt(item.lineDiscountPoisha) * BigInt(quantity)) / BigInt(item.quantity);
    subtotal += BigInt(item.unitPricePoisha) * BigInt(quantity) - discount;
    return { itemId: item.id, quantity, discountPoisha: Number(discount) };
  });
  const orderDiscount =
    ordered.itemsSubtotalPoisha === 0
      ? 0n
      : (BigInt(ordered.orderDiscountPoisha) * subtotal) / BigInt(ordered.itemsSubtotalPoisha);
  const cod =
    subtotal -
    orderDiscount +
    BigInt(ordered.deliveryChargePoisha) -
    BigInt(ordered.advancePaidPoisha);
  return {
    lines,
    amounts: {
      deliveredItemsSubtotalPoisha: Number(subtotal),
      deliveredOrderDiscountPoisha: Number(orderDiscount),
      codAmountPoisha: cod > 0n ? Number(cod) : 0,
    },
  };
}
