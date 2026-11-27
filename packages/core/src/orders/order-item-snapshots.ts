import type { CreateOrderInput } from '@dakly/contracts/orders';

import type { ProductsService } from '../products/products.service';
import { orderError } from './orders.errors';
import type { OrderItemWrite } from './orders.repository';

type OrderVariant = Awaited<ReturnType<ProductsService['orderVariants']>>[number];

export async function orderItemSnapshots({
  storeId,
  products,
  items,
  previous = [],
  isManualOrder = false,
}: {
  storeId: string;
  products: ProductsService;
  items: CreateOrderInput['items'];
  previous?: OrderItemWrite[];
  // Only staff typing an order may sell what is not in stock, and only for products that allow it.
  isManualOrder?: boolean;
}): Promise<OrderItemWrite[]> {
  const byId = new Map(previous.map((item) => [item.variantId, item]));
  const quantities = new Map(items.map(({ variantId, quantity }) => [variantId, quantity]));
  const newIds = items
    .filter(({ variantId }) => !byId.has(variantId))
    .map(({ variantId }) => variantId);
  const variants = await products.orderVariants(storeId, newIds, [...byId.keys()]);
  for (const variant of variants)
    byId.set(
      variant.variantId,
      newLine(variant, quantities.get(variant.variantId) ?? 0, isManualOrder),
    );
  return items.map((item) => ({ ...byId.get(item.variantId)!, ...item }));
}

function newLine(
  { stockStatus, allowOrdersWhenOutOfStock, available, ...line }: OrderVariant,
  quantity: number,
  isManualOrder: boolean,
): OrderItemWrite {
  if (!line.unitPricePoisha) throw orderError('ORDER_PRICE_REQUIRED');
  const mayOversell = isManualOrder && allowOrdersWhenOutOfStock;
  if (!line.isStockTracked && stockStatus === 'out_of_stock' && !mayOversell)
    throw orderError('ORDER_ITEM_OUT_OF_STOCK');
  // Nothing is reserved for a line sold without stock, so stock never goes below zero.
  const soldWithoutStock = mayOversell && quantity > available;
  return { ...line, isStockTracked: line.isStockTracked && !soldWithoutStock, quantity: 0 };
}
