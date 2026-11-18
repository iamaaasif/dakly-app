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
  type OrderReturnRisk,
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
import { changeOrderStage, isSyncedOrder } from './order-fulfilment';
import { orderTotals } from './order-totals';
import { orderError } from './orders.errors';
import { OrdersRepository, type OrderItemWrite, type OrderWrite } from './orders.repository';

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
    editor: CreateEditor,
  ): Promise<OrderDetail> {
    return this.transaction.runLocked(storeId, async () => {
      const { idempotencyKey, access, actor } = editor;
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
      const delivery = await this.deliverySnapshot(storeId, recipient, input.deliveryChargePoisha);
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

      const delivery = await this.editedDelivery(storeId, input);
      const previous = await this.repository.items(storeId, orderId);
      const items = await this.orderItems(storeId, input.items, previous);
      const totals = orderTotals(items, {
        orderDiscountPoisha: input.orderDiscountPoisha ?? order.orderDiscountPoisha,
        deliveryChargePoisha: delivery.deliveryChargePoisha ?? order.deliveryChargePoisha,
        advancePaidPoisha,
      });
      const now = this.clock.now();
      await this.moveReservations(storeId, orderId, { before: previous, after: items }, actor);
      await this.repository.saveItems(
        storeId,
        orderId,
        items.map((item) => ({ ...item, createdAt: now })),
      );
      await this.repository.editOrder(storeId, orderId, {
        ...delivery,
        ...totals,
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
    const page = rows.slice(0, query.limit);
    const outcomes = await this.repository.parcelOutcomes(storeId, [
      ...new Set(page.map(({ recipientPhone }) => recipientPhone)),
    ]);
    const byPhone = new Map(outcomes.map((row) => [row.phone, row]));
    const items = page.map(({ recipientPhone, createdAt, ...row }) => ({
      ...row,
      createdAt: createdAt.toISOString(),
      returnRisk: returnRisk(byPhone.get(recipientPhone)),
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
    const outcomes = await this.repository.parcelOutcomes(storeId, [order.recipientPhone]);
    const history = await this.audit.history(storeId, {
      entityType: 'order',
      entityId: orderId,
      action: 'order.stage_changed',
    });
    return {
      ...order,
      recipientPhone: access.seeFullPhone ? order.recipientPhone : maskPhone(order.recipientPhone),
      createdAt: order.createdAt.toISOString(),
      shippedAt: isoTime(order.shippedAt),
      deliveredAt: isoTime(order.deliveredAt),
      returnedAt: isoTime(order.returnedAt),
      codCollectedAt: isoTime(order.codCollectedAt),
      returnRisk: returnRisk(outcomes[0]),
      items: (await this.repository.items(storeId, orderId)).map(
        ({ unitCostPoisha: _unitCost, ...item }) => item,
      ),
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
      await changeOrderStage(
        storeId,
        { orderId, change, actor },
        {
          orders: this.repository,
          products: this.products,
          audit: this.audit,
          outbox: this.outbox,
          clock: this.clock,
        },
      );
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
      await this.repository.editOrder(storeId, orderId, {
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
    await this.moveReservations(storeId, id, { before: [], after: items }, actor);
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

  private async editedDelivery(storeId: string, input: EditOrderInput) {
    if (input.recipient)
      return this.deliverySnapshot(storeId, input.recipient, input.deliveryChargePoisha);
    if (input.deliveryChargePoisha !== undefined)
      return { deliveryChargePoisha: input.deliveryChargePoisha, isDeliveryChargeOverridden: true };
    return {};
  }

  private async deliverySnapshot(
    storeId: string,
    recipient: CreateOrderInput['recipient'],
    override?: number,
  ) {
    const zone = await this.delivery.calculateDeliveryCharge(storeId, recipient.areaId);
    return {
      recipientName: recipient.name,
      recipientPhone: recipient.phone,
      recipientAddress: recipient.address,
      recipientDistrict: zone.district,
      recipientBdAreaId: recipient.areaId,
      isRecipientBuyer: recipient.isBuyer,
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
    return items.map((item) => {
      const variant = byId.get(item.variantId);
      if (!variant) throw orderError('ORDER_NOT_EDITABLE');
      return { ...variant, ...item };
    });
  }

  private async moveReservations(
    storeId: string,
    orderId: string,
    { before, after }: { before: OrderItemWrite[]; after: OrderItemWrite[] },
    actor: AuditEntry['actor'],
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
        reference: { orderId, actor },
      });
    }
  }
}

function canEditOrder(order: Pick<OrderDetail, 'source' | 'stage' | 'paymentStatus'>): boolean {
  return (
    !isSyncedOrder(order.source) &&
    ['to_confirm', 'on_hold', 'to_pack'].includes(order.stage) &&
    ['cod_pending', 'advance_paid'].includes(order.paymentStatus)
  );
}

function returnRisk(outcome?: { parcels: number; returned: number }): OrderReturnRisk {
  if (!outcome) return 'new_customer';
  if (outcome.parcels < 2) return null;
  if (2 * outcome.returned >= outcome.parcels) return 'high';
  return 5 * outcome.returned <= outcome.parcels ? 'good' : 'some_returns';
}

function isoTime(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}
