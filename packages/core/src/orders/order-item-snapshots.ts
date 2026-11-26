import type { CreateOrderInput } from '@dakly/contracts/orders';

import type { ProductsService } from '../products/products.service';
import { orderError } from './orders.errors';
import type { OrderItemWrite } from './orders.repository';

export async function orderItemSnapshots(
  storeId: string,
  products: ProductsService,
  items: CreateOrderInput['items'],
  previous: OrderItemWrite[] = [],
): Promise<OrderItemWrite[]> {
  const byId = new Map(previous.map((item) => [item.variantId, item]));
  const newIds = items
    .filter(({ variantId }) => !byId.has(variantId))
    .map(({ variantId }) => variantId);
  const variants = await products.orderVariants(storeId, newIds, [...byId.keys()]);
  for (const variant of variants) {
    if (!variant.unitPricePoisha) throw orderError('ORDER_PRICE_REQUIRED');
    byId.set(variant.variantId, { ...variant, quantity: 0 });
  }
  return items.map((item) => ({ ...byId.get(item.variantId)!, ...item }));
}
