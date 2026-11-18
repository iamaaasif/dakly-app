import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  orderStages,
  type CodCollectedInput,
  type CreateOrderInput,
  type EditOrderInput,
  type OrderDetail,
  type OrderListQuery,
  type OrderListResponse,
  type OrderStage,
  type OrderStageChange,
} from '@dakly/contracts/orders';
import { maskPhone } from '@dakly/contracts/phone';
import type { StoreAccess } from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { ContactsService } from '../contacts/contacts.service';
import { DeliveryService } from '../delivery/delivery.service';
import { Clock } from '../platform/clock';
import { newId } from '../platform/database/new-id';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ProductsService } from '../products/products.service';
import { StoresService } from '../stores/stores.service';
import { applyOrderFulfilment } from './order-fulfilment';
import { orderStageTransitions } from './order-stage';
import { orderTotals } from './order-totals';
import { orderError } from './orders.errors';
import {
  OrdersRepository,
  type OrderItemWrite,
  type OrderWrite,
  type StageWrite,
} from './orders.repository';

const stageSnapshot = z.object({ state: z.enum(orderStages) });

type Access = Pick<StoreAccess, 'seeFullPhone'>;
type StageEditor = { actor: AuditEntry['actor']; access: Access };
type CreateEditor = {
  actor: Extract<AuditEntry['actor'], { kind: 'user' }>;
  access: Access;
  idempotencyKey: string;
};

@Injectable()
export class OrdersService {
  constructor(
    @Inject(OrdersRepository) private readonly repository: OrdersRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ContactsService) private readonly contacts: ContactsService,
    @Inject(DeliveryService) private readonly delivery: DeliveryService,
    @Inject(StoresService) private readonly stores: StoresService,
  ) {}

  createOrder(
    storeId: string,
    input: CreateOrderInput,
    { idempotencyKey, access, actor }: CreateEditor,
  ): Promise<OrderDetail> {
    return this.transaction.runLocked(storeId, async () => {
      const existing = await this.repository.findByIdempotencyKey(storeId, idempotencyKey);
      if (existing) return this.getById(storeId, existing.id, access);

      const id = newId();
      const { buyer, recipient } = input;
      const contact = await this.contacts.resolveOrderBuyer(
        storeId,
        {
          buyer,
          orderId: id,
          ownPhone: recipient.isBuyer ? recipient.phone : undefined,
        },
        actor,
      );
      const delivery = await this.quoteDelivery(
        storeId,
        recipient.areaId,
        input.deliveryChargePoisha,
      );
      const items = await this.orderItems(storeId, input.items);
      const totals = orderTotals(items, {
        ...input,
        deliveryChargePoisha: delivery.deliveryChargePoisha,
      });
      const now = this.clock.now();
      const duplicate = await this.repository.findDuplicate(storeId, {
        orderId: id,
        phone: recipient.phone,
        variantIds: items.map(({ variantId }) => variantId),
        since: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      });
      const order = {
        id,
        number: await this.stores.nextOrderNumber(storeId),
        buyerContactId: contact.id,
        buyerName: contact.name,
        recipientName: recipient.name,
        recipientPhone: recipient.phone,
        recipientAddress: recipient.address,
        isRecipientBuyer: recipient.isBuyer,
        source: 'manual',
        createdByType: 'user',
        createdByUserId: actor.userId,
        idempotencyKey,
        ...delivery,
        ...totals,
        paymentStatus: input.advancePaidPoisha > 0 ? 'advance_paid' : 'cod_pending',
        possibleDuplicateOfOrderId: duplicate,
        createdAt: now,
        updatedAt: now,
      } satisfies OrderWrite;
      await this.saveNewOrder(storeId, order, items, actor);
      return this.getById(storeId, id, access);
    });
  }

  editOrder(
    storeId: string,
    orderId: string,
    input: EditOrderInput,
    { actor, access }: StageEditor,
  ): Promise<OrderDetail> {
    return this.transaction.runLocked(storeId, async () => {
      const order = await this.repository.lock(storeId, orderId);
      if (!order) throw orderError('ORDER_NOT_FOUND');
      if (!canEditOrder(order)) throw orderError('ORDER_NOT_EDITABLE');

      const advancePaidPoisha = input.advancePaidPoisha ?? order.advancePaidPoisha;
      if (order.advancePaidPoisha > 0 && order.advancePaidPoisha !== advancePaidPoisha)
        throw orderError('ORDER_ADVANCE_ALREADY_PAID');

      const delivery = await this.editedDelivery(storeId, input, order);
      const previous = await this.repository.items(storeId, orderId);
      const items = await this.orderItems(storeId, input.items, previous);
      const totals = orderTotals(items, {
        orderDiscountPoisha: input.orderDiscountPoisha ?? order.orderDiscountPoisha,
        deliveryChargePoisha: delivery.deliveryChargePoisha ?? order.deliveryChargePoisha,
        advancePaidPoisha,
      });
      const now = this.clock.now();
      const possibleDuplicateOfOrderId = await this.repository.findDuplicate(storeId, {
        orderId,
        phone: delivery.recipientPhone,
        variantIds: items.map(({ variantId }) => variantId),
        since: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      });
      await this.moveReservations(storeId, orderId, { before: previous, after: items }, { actor });
      await this.repository.saveItems(
        storeId,
        orderId,
        items.map((item) => ({ ...item, createdAt: now })),
      );
      await this.repository.updateOrder(storeId, orderId, {
        ...delivery,
        ...totals,
        possibleDuplicateOfOrderId,
        paymentStatus: advancePaidPoisha > 0 ? 'advance_paid' : 'cod_pending',
        updatedAt: now,
      });
      await this.audit.record(storeId, {
        action: 'order.edited',
        entityType: 'order',
        entityId: orderId,
        actor,
        after: { changedFields: Object.keys(input) },
      });
      return this.getById(storeId, orderId, access);
    });
  }

  async list(storeId: string, query: OrderListQuery): Promise<OrderListResponse> {
    const rows = await this.repository.list(storeId, query);
    const items = rows.slice(0, query.limit).map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
    const counts = {
      to_confirm: 0,
      on_hold: 0,
      to_pack: 0,
      with_courier: 0,
      delivered: 0,
      partially_delivered: 0,
      returned: 0,
      cancelled: 0,
    };
    for (const row of await this.repository.countByStage(storeId)) counts[row.stage] = row.count;
    return {
      items,
      counts,
      nextCursor: rows.length > query.limit ? (items.at(-1)?.number ?? null) : null,
    };
  }

  async getById(storeId: string, orderId: string, access: Access): Promise<OrderDetail> {
    const order = await this.repository.find(storeId, orderId);
    if (!order) throw orderError('ORDER_NOT_FOUND');
    const history = await this.audit.history(storeId, {
      entityType: 'order',
      entityId: orderId,
      action: 'order.stage_changed',
    });
    return {
      ...order,
      recipientPhone: access.seeFullPhone ? order.recipientPhone : maskPhone(order.recipientPhone),
      possibleDuplicateOfOrderId: access.seeFullPhone ? order.possibleDuplicateOfOrderId : null,
      createdAt: order.createdAt.toISOString(),
      shippedAt: isoTime(order.shippedAt),
      deliveredAt: isoTime(order.deliveredAt),
      returnedAt: isoTime(order.returnedAt),
      codCollectedAt: isoTime(order.codCollectedAt),
      items: await this.repository.items(storeId, orderId),
      timeline: history.map(({ before, after, createdAt, ...row }) => ({
        ...row,
        from: stageSnapshot.parse(before).state,
        to: stageSnapshot.parse(after).state,
        occurredAt: createdAt.toISOString(),
      })),
    };
  }

  changeStage(
    storeId: string,
    orderId: string,
    change: OrderStageChange,
    { actor, access }: StageEditor,
  ): Promise<OrderDetail> {
    return this.transaction.run(storeId, async () => {
      const order = await this.repository.lock(storeId, orderId);
      if (!order) throw orderError('ORDER_NOT_FOUND');
      if (!orderStageTransitions[order.stage].includes(change.to) || isSyncedOrder(order.source))
        throw orderError('ORDER_STAGE_NOT_ALLOWED');

      const now = this.clock.now();
      const confirmed = change.to === 'to_pack' && !order.confirmedAt;
      if (change.to === 'cancelled') {
        await this.moveReservations(
          storeId,
          orderId,
          { before: await this.repository.items(storeId, orderId), after: [] },
          { actor, reason: change.reason },
        );
      }
      const fulfilment = await applyOrderFulfilment(
        storeId,
        { order, change, actor, now },
        { orders: this.repository, products: this.products },
      );
      await this.repository.updateOrder(storeId, orderId, {
        ...fulfilment,
        ...stageWrite(change, now, confirmed),
        ...(change.to === 'cancelled' && order.paymentStatus === 'advance_paid'
          ? { paymentStatus: 'refund_due' }
          : {}),
      });
      await this.recordStage(storeId, orderId, {
        from: order.stage,
        change,
        actor,
        occurredAt: now.toISOString(),
      });
      if (confirmed)
        await this.outbox.publish({
          type: 'order.confirmed',
          storeId,
          occurredAt: now.toISOString(),
          payload: { orderId },
        });
      return this.getById(storeId, orderId, access);
    });
  }

  recordCodCollected(
    storeId: string,
    orderId: string,
    { amountPoisha }: CodCollectedInput,
    { actor, access }: StageEditor,
  ): Promise<OrderDetail> {
    return this.transaction.run(storeId, async () => {
      const order = await this.repository.lock(storeId, orderId);
      if (!order) throw orderError('ORDER_NOT_FOUND');
      if (
        isSyncedOrder(order.source) ||
        !['delivered', 'partially_delivered'].includes(order.stage) ||
        !['cod_pending', 'advance_paid'].includes(order.paymentStatus)
      )
        throw orderError('ORDER_COD_NOT_COLLECTABLE');
      const now = this.clock.now();
      await this.repository.updateOrder(storeId, orderId, {
        paymentStatus: 'cod_collected',
        codCollectedPoisha: amountPoisha,
        codCollectedAt: now,
        updatedAt: now,
      });
      await this.audit.record(storeId, {
        actor,
        action: 'order.cod_collected',
        entityType: 'order',
        entityId: orderId,
        before: { state: order.paymentStatus },
        after: { state: 'cod_collected' },
      });
      await this.outbox.publish({
        type: 'order.cod_collected',
        storeId,
        occurredAt: now.toISOString(),
        payload: { orderId },
      });
      return this.getById(storeId, orderId, access);
    });
  }

  private async saveNewOrder(
    storeId: string,
    order: OrderWrite & { id: string; buyerContactId: string; createdAt: Date },
    items: OrderItemWrite[],
    actor: AuditEntry['actor'],
  ): Promise<void> {
    const { id, createdAt, buyerContactId } = order;
    await this.repository.insert(storeId, order);
    await this.moveReservations(storeId, id, { before: [], after: items }, { actor });
    await this.repository.insertItems(
      storeId,
      id,
      items.map((item) => ({ ...item, createdAt })),
    );
    await this.contacts.markOrderLinked(storeId, buyerContactId, actor);
    await this.outbox.publish({
      type: 'order.created',
      storeId,
      occurredAt: createdAt.toISOString(),
      payload: { orderId: id },
    });
  }

  private async editedDelivery(
    storeId: string,
    input: EditOrderInput,
    order: Pick<OrderDetail, 'recipientBdAreaId' | 'recipientPhone'>,
  ) {
    const recipient = input.recipient;
    const override = input.deliveryChargePoisha;
    const snapshot = {
      recipientName: recipient?.name,
      recipientPhone: recipient?.phone ?? order.recipientPhone,
      recipientAddress: recipient?.address,
      isRecipientBuyer: recipient?.isBuyer,
    };
    if (recipient?.areaId !== undefined && recipient.areaId !== order.recipientBdAreaId)
      return { ...snapshot, ...(await this.quoteDelivery(storeId, recipient.areaId, override)) };
    return {
      ...snapshot,
      deliveryChargePoisha: override,
      isDeliveryChargeOverridden: override === undefined ? undefined : true,
    };
  }

  private async quoteDelivery(storeId: string, areaId: number, override?: number) {
    const zone = await this.delivery.calculateDeliveryCharge(storeId, areaId);
    return {
      recipientDistrict: zone.district,
      recipientBdAreaId: areaId,
      deliveryZoneId: zone.deliveryZoneId,
      deliveryChargePoisha: override ?? zone.chargePoisha,
      isDeliveryChargeOverridden: override !== undefined,
    };
  }

  private async orderItems(
    storeId: string,
    items: CreateOrderInput['items'],
    previous: OrderItemWrite[] = [],
  ): Promise<OrderItemWrite[]> {
    const byId = new Map(previous.map((item) => [item.variantId, item]));
    const newIds = items
      .filter(({ variantId }) => !byId.has(variantId))
      .map(({ variantId }) => variantId);
    const variants = await this.products.orderVariants(storeId, newIds, [...byId.keys()]);
    for (const variant of variants) {
      if (!variant.unitPricePoisha) throw orderError('ORDER_PRICE_REQUIRED');
      byId.set(variant.variantId, { ...variant, quantity: 0 });
    }
    return items.map((item) => ({ ...byId.get(item.variantId)!, ...item }));
  }

  private async moveReservations(
    storeId: string,
    orderId: string,
    { before, after }: { before: OrderItemWrite[]; after: OrderItemWrite[] },
    { actor, reason }: { actor: AuditEntry['actor']; reason?: string },
  ): Promise<void> {
    const deltas = new Map<string, number>();
    for (const item of before)
      if (item.isStockTracked)
        deltas.set(item.variantId, (deltas.get(item.variantId) ?? 0) - item.quantity);
    for (const item of after)
      if (item.isStockTracked)
        deltas.set(item.variantId, (deltas.get(item.variantId) ?? 0) + item.quantity);
    for (const [variantId, delta] of [...deltas].sort(([a], [b]) => a.localeCompare(b))) {
      if (delta === 0) continue;
      await this.products.moveStock(storeId, variantId, {
        kind: delta > 0 ? 'reserve' : 'release',
        quantity: Math.abs(delta),
        reference: { orderId, actor, reason },
      });
    }
  }

  private async recordStage(
    storeId: string,
    orderId: string,
    {
      from,
      change,
      actor,
      occurredAt,
    }: {
      from: OrderStage;
      change: OrderStageChange;
      actor: AuditEntry['actor'];
      occurredAt: string;
    },
  ): Promise<void> {
    const reason = 'reason' in change ? change.reason : undefined;
    await this.audit.record(storeId, {
      actor,
      action: 'order.stage_changed',
      entityType: 'order',
      entityId: orderId,
      before: { state: from },
      after: { state: change.to },
      reason: 'note' in change ? change.note : reason,
    });
    await this.outbox.publish({
      type: 'order.stage_changed',
      storeId,
      occurredAt,
      payload: { orderId, from, to: change.to },
    });
  }
}

function stageWrite(change: OrderStageChange, now: Date, confirmed: boolean): StageWrite {
  return {
    stage: change.to,
    onHoldReason: change.to === 'on_hold' ? change.reason : null,
    followUpOn: change.to === 'on_hold' ? (change.followUpOn ?? null) : null,
    cancelReason: change.to === 'cancelled' ? change.reason : null,
    ...(confirmed && { confirmedAt: now, confirmationMethod: 'staff' }),
    ...(change.to === 'cancelled' && { cancelledAt: now }),
    updatedAt: now,
  };
}

function isSyncedOrder(source: OrderDetail['source']): boolean {
  return source === 'shopify' || source === 'woocommerce';
}

function canEditOrder(order: Pick<OrderDetail, 'source' | 'stage' | 'paymentStatus'>): boolean {
  return (
    !isSyncedOrder(order.source) &&
    ['to_confirm', 'on_hold', 'to_pack'].includes(order.stage) &&
    ['cod_pending', 'advance_paid'].includes(order.paymentStatus)
  );
}

function isoTime(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}
