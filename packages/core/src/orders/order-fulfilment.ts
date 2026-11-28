import type { AuditEntry } from '@dakly/contracts/audit';
import type { OrderStage, OrderStageChange } from '@dakly/contracts/orders';
import type { StockMovementKind } from '@dakly/contracts/products';

import type { ProductStockService } from '../products/product-stock.service';
import { orderTotals, partialOrderTotals } from './order-totals';
import { orderError } from './orders.errors';
import type { OrdersRepository, StageWrite } from './orders.repository';

type Actor = AuditEntry['actor'];
type LockedOrder = NonNullable<Awaited<ReturnType<OrdersRepository['lock']>>>;
type Items = Awaited<ReturnType<OrdersRepository['items']>>;
type FulfilmentDependencies = { orders: OrdersRepository; stock: ProductStockService };

export async function applyOrderFulfilment(
  storeId: string,
  {
    order,
    change,
    actor,
    now,
  }: { order: LockedOrder; change: OrderStageChange; actor: Actor; now: Date },
  { orders, stock }: FulfilmentDependencies,
): Promise<StageWrite> {
  const orderId = order.id;
  const reference = { orderId, actor };
  if (isReopening(order.stage, change.to))
    return reopenOrder(storeId, { order, change, actor }, { orders, stock });
  switch (change.to) {
    case 'with_courier':
      if (actor.kind !== 'user') throw orderError('ORDER_STAGE_NOT_ALLOWED');
      await moveOrderStock(storeId, stock, await orders.items(storeId, orderId), {
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
      return recordDelivery(storeId, { order, change, actor, now }, { orders, stock });
    case 'returned':
      if (!change.isDamaged) {
        const lines = (await orders.items(storeId, orderId)).map((item) => ({
          ...item,
          quantity: item.deliveredQuantity ?? item.quantity,
        }));
        await moveOrderStock(storeId, stock, lines, {
          kind: 'return',
          reference: { ...reference, reason: change.reason },
        });
      }
      return {
        returnedAt: now,
        returnReason: change.reason,
        ...(['paid', 'advance_paid', 'cod_collected'].includes(order.paymentStatus) && {
          paymentStatus: 'refund_due',
        }),
      };
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
  { orders, stock }: FulfilmentDependencies,
): Promise<StageWrite> {
  const orderId = order.id;
  const items = await orders.items(storeId, orderId);
  const delivered = deliveredQuantities(change, items);
  await moveOrderStock(
    storeId,
    stock,
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
  stock: ProductStockService,
  items: Items,
  movement: {
    kind: StockMovementKind;
    reference: { orderId: string; actor: Actor; reason?: string };
  },
): Promise<void> {
  for (const { variantId, quantity, isStockTracked } of items) {
    if (isStockTracked && quantity > 0)
      await stock.moveStock(storeId, variantId, { ...movement, quantity });
  }
}

const reopenTargets: OrderStageChange['to'][] = [
  'with_courier',
  'to_confirm',
  'on_hold',
  'to_pack',
];

function isReopening(from: OrderStage, to: OrderStageChange['to']): boolean {
  const leavable =
    from === 'with_courier' || from === 'delivered' || from === 'partially_delivered';
  return leavable && reopenTargets.includes(to);
}

// Staff move an order back out of Courier or Delivered. Stock and COD return to where they were
// before that step, so moving forward again does not count the parcel twice.
async function reopenOrder(
  storeId: string,
  { order, change, actor }: { order: LockedOrder; change: OrderStageChange; actor: Actor },
  { orders, stock }: FulfilmentDependencies,
): Promise<StageWrite> {
  if (actor.kind !== 'user') throw orderError('ORDER_STAGE_NOT_ALLOWED');
  const items = await orders.items(storeId, order.id);
  const reference = { orderId: order.id, actor, reason: 'Delivery reopened' };
  const write: StageWrite = { deliveredAt: null };
  if (order.stage !== 'with_courier')
    Object.assign(
      write,
      await reverseDelivery(storeId, { order, items, reference }, { orders, stock }),
    );

  if (change.to === 'with_courier') {
    const { courier, courierOtherName, trackingCode } = change;
    return { ...write, ...(courier !== undefined && { courier, courierOtherName, trackingCode }) };
  }
  // Back to a step before the courier: undo the ship movement so the units are only reserved.
  for (const { variantId, quantity, isStockTracked } of items) {
    if (!isStockTracked) continue;
    await stock.moveStock(storeId, variantId, { kind: 'return', quantity, reference });
    await stock.moveStock(storeId, variantId, { kind: 'reserve', quantity, reference });
  }
  return {
    ...write,
    courier: null,
    courierOtherName: null,
    trackingCode: null,
    shippedAt: null,
    shippedByUserId: null,
  };
}

async function reverseDelivery(
  storeId: string,
  {
    order,
    items,
    reference,
  }: {
    order: LockedOrder;
    items: Items;
    reference: { orderId: string; actor: Actor; reason: string };
  },
  { orders, stock }: FulfilmentDependencies,
): Promise<StageWrite> {
  // A partial delivery put the undelivered units back on the shelf; take them off again.
  for (const { variantId, quantity, deliveredQuantity, isStockTracked } of items) {
    const undelivered = quantity - (deliveredQuantity ?? quantity);
    if (isStockTracked && undelivered > 0)
      await stock.moveStock(storeId, variantId, {
        kind: 'adjust',
        quantity: -undelivered,
        reference,
      });
  }
  await orders.recordDelivery(
    storeId,
    order.id,
    items.map(({ id }) => ({ itemId: id, quantity: null })),
  );
  return {
    deliveredItemsSubtotalPoisha: null,
    deliveredOrderDiscountPoisha: null,
    // Only a partial delivery rewrote the COD amount.
    ...(order.deliveredItemsSubtotalPoisha !== null && {
      codAmountPoisha: orderTotals(items, order).codAmountPoisha,
    }),
    ...(order.paymentStatus === 'cod_collected' && {
      paymentStatus: order.advancePaidPoisha > 0 ? 'advance_paid' : 'cod_pending',
      codCollectedPoisha: null,
      codCollectedAt: null,
    }),
  };
}
