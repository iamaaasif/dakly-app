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
  const discount = BigInt(orderDiscountPoisha);
  const cod = subtotal - discount + BigInt(deliveryChargePoisha) - BigInt(advancePaidPoisha);
  if (discount > subtotal || subtotal > Number.MAX_SAFE_INTEGER || cod > Number.MAX_SAFE_INTEGER)
    throw orderError('ORDER_TOTAL_INVALID');
  return {
    itemsSubtotalPoisha: Number(subtotal),
    orderDiscountPoisha,
    advancePaidPoisha,
    codAmountPoisha: cod > 0n ? Number(cod) : 0,
  };
}
