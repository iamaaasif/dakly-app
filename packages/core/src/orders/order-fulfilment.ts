import type { AuditEntry } from '@dakly/contracts/audit';
import type { OrderStageChange } from '@dakly/contracts/orders';
import type { StockMovementKind } from '@dakly/contracts/products';

import type { AuditService } from '../audit/audit.service';
import type { Clock } from '../platform/clock';
import type { OutboxService } from '../platform/outbox/outbox.service';
import type { ProductsService } from '../products/products.service';
import { orderStageTransitions } from './order-stage';
import { partialOrderTotals } from './order-totals';
import { orderError } from './orders.errors';
import type { OrdersRepository, StageWrite } from './orders.repository';

type Actor = AuditEntry['actor'];
type LockedOrder = NonNullable<Awaited<ReturnType<OrdersRepository['lock']>>>;
type Items = Awaited<ReturnType<OrdersRepository['items']>>;
type StageInput = { orderId: string; change: OrderStageChange; actor: Actor; now: Date };
type StageDependencies = {
  orders: OrdersRepository;
  products: ProductsService;
  audit: AuditService;
  outbox: OutboxService;
  clock: Clock;
};

export async function changeOrderStage(
  storeId: string,
  input: Omit<StageInput, 'now'>,
  deps: StageDependencies,
): Promise<void> {
  const { orderId, change, actor } = input;
  const order = await deps.orders.lock(storeId, orderId);
  if (!order) throw orderError('ORDER_NOT_FOUND');
  if (!orderStageTransitions[order.stage].includes(change.to) || isSyncedOrder(order.source))
    throw orderError('ORDER_STAGE_NOT_ALLOWED');

  const now = deps.clock.now();
  const confirmed = change.to === 'to_pack' && !order.confirmedAt;
  const result = await fulfilmentWrite(storeId, { ...input, now }, order, deps);
  const reason = 'reason' in change ? change.reason : undefined;
  await deps.orders.updateOrder(storeId, orderId, {
    ...stageFields(change, now, confirmed),
    ...result,
  });
  await deps.audit.record(storeId, {
    actor,
    action: 'order.stage_changed',
    entityType: 'order',
    entityId: orderId,
    before: { state: order.stage },
    after: { state: change.to },
    reason,
  });
  const occurredAt = now.toISOString();
  await deps.outbox.publish({
    type: 'order.stage_changed',
    storeId,
    occurredAt,
    payload: { orderId, from: order.stage, to: change.to },
  });
  if (confirmed)
    await deps.outbox.publish({
      type: 'order.confirmed',
      storeId,
      occurredAt,
      payload: { orderId },
    });
}

function stageFields(change: OrderStageChange, now: Date, confirmed: boolean): StageWrite {
  return {
    stage: change.to,
    onHoldReason: change.to === 'on_hold' ? change.reason : null,
    followUpOn: change.to === 'on_hold' ? (change.followUpOn ?? null) : null,
    cancelReason: change.to === 'cancelled' ? change.reason : null,
    ...(confirmed && { confirmedAt: now, confirmationMethod: 'staff' }),
    updatedAt: now,
  };
}

async function fulfilmentWrite(
  storeId: string,
  { orderId, change, actor, now }: StageInput,
  order: LockedOrder,
  { orders, products }: StageDependencies,
): Promise<StageWrite> {
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
    case 'cancelled':
      await moveOrderStock(storeId, products, await orders.items(storeId, orderId), {
        kind: 'release',
        reference: { ...reference, reason: change.reason },
      });
      return {
        cancelledAt: now,
        ...(order.paymentStatus === 'advance_paid' && { paymentStatus: 'refund_due' }),
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
  { orders, products }: Pick<StageDependencies, 'orders' | 'products'>,
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

export function isSyncedOrder(source: LockedOrder['source']): boolean {
  return source === 'shopify' || source === 'woocommerce';
}
