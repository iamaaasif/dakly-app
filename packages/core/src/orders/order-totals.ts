import type { EditOrderInput, OrderDetail, OrderItem, OrderSummary } from '@dakly/contracts/orders';

import { orderError } from './orders.errors';
import type { OrderItemWrite } from './orders.repository';

export function editedOrderTotals(
  items: OrderItemWrite[],
  order: Pick<OrderSummary, 'advancePaidPoisha' | 'orderDiscountPoisha' | 'deliveryChargePoisha'>,
  input: EditOrderInput,
  deliveryChargePoisha: number | undefined,
) {
  const advancePaidPoisha = input.advancePaidPoisha ?? order.advancePaidPoisha;
  if (order.advancePaidPoisha > 0 && order.advancePaidPoisha !== advancePaidPoisha)
    throw orderError('ORDER_ADVANCE_ALREADY_PAID');
  return orderTotals(items, {
    orderDiscountPoisha: input.orderDiscountPoisha ?? order.orderDiscountPoisha,
    deliveryChargePoisha: deliveryChargePoisha ?? order.deliveryChargePoisha,
    advancePaidPoisha,
  });
}

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
  const discount = BigInt(orderDiscountPoisha);
  const total = totalBeforeAdvance(subtotal, discount, deliveryChargePoisha);
  const cod = total - BigInt(advancePaidPoisha);
  if (discount > subtotal || subtotal > Number.MAX_SAFE_INTEGER || total > Number.MAX_SAFE_INTEGER)
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
    totalBeforeAdvance(subtotal, orderDiscount, ordered.deliveryChargePoisha) -
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

export function orderTotalPoisha(
  order: Pick<
    OrderSummary,
    | 'itemsSubtotalPoisha'
    | 'orderDiscountPoisha'
    | 'deliveryChargePoisha'
    | 'deliveredItemsSubtotalPoisha'
    | 'deliveredOrderDiscountPoisha'
  >,
): number {
  return Number(
    totalBeforeAdvance(
      BigInt(order.deliveredItemsSubtotalPoisha ?? order.itemsSubtotalPoisha),
      BigInt(order.deliveredOrderDiscountPoisha ?? order.orderDiscountPoisha),
      order.deliveryChargePoisha,
    ),
  );
}

function totalBeforeAdvance(subtotal: bigint, discount: bigint, deliveryChargePoisha: number) {
  return subtotal - discount + BigInt(deliveryChargePoisha);
}
