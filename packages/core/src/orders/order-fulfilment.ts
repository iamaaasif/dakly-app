import type { AuditEntry } from '@dakly/contracts/audit';
import type { OrderStageChange } from '@dakly/contracts/orders';
import type { StockMovementKind } from '@dakly/contracts/products';

import type { ProductsService } from '../products/products.service';
import { partialOrderTotals } from './order-totals';
import { orderError } from './orders.errors';
import type { OrdersRepository, StageWrite } from './orders.repository';

type Actor = AuditEntry['actor'];
type LockedOrder = NonNullable<Awaited<ReturnType<OrdersRepository['lock']>>>;
type Items = Awaited<ReturnType<OrdersRepository['items']>>;
type FulfilmentDependencies = { orders: OrdersRepository; products: ProductsService };

export async function applyOrderFulfilment(
  storeId: string,
  {
    order,
    change,
    actor,
    now,
  }: { order: LockedOrder; change: OrderStageChange; actor: Actor; now: Date },
  { orders, products }: FulfilmentDependencies,
): Promise<StageWrite> {
  const orderId = order.id;
  const reference = { orderId, actor };
  switch (change.to) {
    case 'with_courier':
      if (actor.kind !== 'user') throw orderError('ORDER_STAGE_NOT_ALLOWED');
      await moveOrderStock(storeId, products, await orders.items(storeId, orderId), {
        kind: 'ship',
        reference,
      });
      return {
        courier: change.courier,
        courierOtherName: change.courierOtherName,
        trackingCode: change.trackingCode,
        shippedAt: now,
        shippedByUserId: actor.userId,
      };
    case 'delivered':
    case 'partially_delivered':
      return recordDelivery(storeId, { order, change, actor, now }, { orders, products });
    case 'returned':
      if (!change.isDamaged) {
        const lines = (await orders.items(storeId, orderId)).map((item) => ({
          ...item,
          quantity:
            order.stage === 'with_courier'
              ? item.quantity
              : (item.deliveredQuantity ?? (order.stage === 'delivered' ? item.quantity : 0)),
        }));
        await moveOrderStock(storeId, products, lines, {
          kind: 'return',
          reference: { ...reference, reason: change.reason },
        });
      }
      return { returnedAt: now, returnReason: change.reason };
    default:
      return {};
  }
}

type DeliveryChange = Extract<OrderStageChange, { to: 'delivered' | 'partially_delivered' }>;

async function recordDelivery(
  storeId: string,
  {
    order,
    change,
    actor,
    now,
  }: { order: LockedOrder; change: DeliveryChange; actor: Actor; now: Date },
  { orders, products }: FulfilmentDependencies,
): Promise<StageWrite> {
  const orderId = order.id;
  const items = await orders.items(storeId, orderId);
  const delivered = deliveredQuantities(change, items);
  await moveOrderStock(
    storeId,
    products,
    delivered.map(({ item, quantity }) => ({ ...item, quantity: item.quantity - quantity })),
    { kind: 'return', reference: { orderId, actor } },
  );
  if (change.to === 'partially_delivered') {
    const { lines, amounts } = partialOrderTotals(order, delivered);
    await orders.recordDelivery(storeId, orderId, lines);
    return { deliveredAt: now, ...amounts };
  }

  await orders.recordDelivery(
    storeId,
    orderId,
    delivered.map(({ item, quantity }) => ({ itemId: item.id, quantity })),
  );
  return { deliveredAt: now };
}

function deliveredQuantities(change: DeliveryChange, items: Items) {
  if (change.to === 'delivered') return items.map((item) => ({ item, quantity: item.quantity }));
  const quantities = new Map(change.items.map(({ itemId, quantity }) => [itemId, quantity]));
  if (quantities.size !== items.length) throw orderError('ORDER_DELIVERED_QUANTITY_INVALID');
  const delivered = items.map((item) => {
    const quantity = quantities.get(item.id);
    if (quantity === undefined || quantity > item.quantity)
      throw orderError('ORDER_DELIVERED_QUANTITY_INVALID');
    return { item, quantity };
  });
  if (
    delivered.every(({ quantity }) => quantity === 0) ||
    delivered.every(({ item, quantity }) => quantity === item.quantity)
  )
    throw orderError('ORDER_DELIVERED_QUANTITY_INVALID');
  return delivered;
}

async function moveOrderStock(
  storeId: string,
  products: ProductsService,
  items: Items,
  movement: {
    kind: StockMovementKind;
    reference: { orderId: string; actor: Actor; reason?: string };
  },
): Promise<void> {
  for (const { variantId, quantity, isStockTracked } of items) {
    if (isStockTracked && quantity > 0)
      await products.moveStock(storeId, variantId, { ...movement, quantity });
  }
}
