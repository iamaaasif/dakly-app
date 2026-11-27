import type { CreateOrderInput, EditOrderInput } from '@dakly/contracts/orders';

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
  // Staff may add an untracked product the owner marked out of stock; no other source may.
  isManualOrder?: boolean;
}): Promise<OrderItemWrite[]> {
  const byId = new Map(previous.map((item) => [item.variantId, item]));
  const newIds = items
    .filter(({ variantId }) => !byId.has(variantId))
    .map(({ variantId }) => variantId);
  const variants = await products.orderVariants(storeId, newIds, [...byId.keys()]);
  for (const variant of variants) byId.set(variant.variantId, newLine(variant, isManualOrder));
  return items.map((item) => ({ ...byId.get(item.variantId)!, ...item }));
}

export function editedItemSnapshots(
  storeId: string,
  products: ProductsService,
  {
    order,
    input,
    previous,
  }: { order: { source: string }; input: EditOrderInput; previous: OrderItemWrite[] },
): Promise<OrderItemWrite[]> {
  if (!input.items) return Promise.resolve(previous);
  const isManualOrder = order.source === 'manual';
  return orderItemSnapshots({ storeId, products, items: input.items, previous, isManualOrder });
}

function newLine({ stockStatus, ...line }: OrderVariant, isManualOrder: boolean): OrderItemWrite {
  if (!line.unitPricePoisha) throw orderError('ORDER_PRICE_REQUIRED');
  if (!line.isStockTracked && stockStatus === 'out_of_stock' && !isManualOrder)
    throw orderError('ORDER_ITEM_OUT_OF_STOCK');
  return { ...line, quantity: 0 };
}
