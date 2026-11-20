import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  orderStageTransitions,
  type CodCollectedInput,
  type CreateOrderInput,
  type EditOrderInput,
  type OrderDetail,
  type OrderListQuery,
  type OrderListResponse,
  type OrderStageChange,
} from '@dakly/contracts/orders';
import { bdMobileSchema, maskPhone } from '@dakly/contracts/phone';
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
import { OrderAttributionService } from './order-attribution.service';
import { applyOrderFulfilment } from './order-fulfilment';
import { moveOrderReservations } from './order-reservations';
import { returnRisk } from './order-risk';
import {
  isSyncedOrder,
  orderStageCounts,
  orderStageHistory,
  productArchiveStages,
  recordOrderCreation,
  recordOrderEdit,
  recordOrderStage,
  requireEditableOrder,
  staffConfirmation,
  stageWrite,
  stagesForOrderTab,
} from './order-stage';
import { editedOrderTotals, orderTotalPoisha, orderTotals } from './order-totals';
import { orderError } from './orders.errors';
import { OrdersRepository, type OrderItemWrite, type OrderWrite } from './orders.repository';

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
    @Inject(OrderAttributionService) private readonly attribution: OrderAttributionService,
  ) {}

  archiveProduct(storeId: string, productId: string, actor: AuditEntry['actor']): Promise<void> {
    return this.transaction.run(storeId, async () => {
      const variantIds = await this.products.lockArchiveVariants(storeId, productId);
      if (await this.repository.hasItemsInStages(storeId, variantIds, productArchiveStages))
        throw orderError('PRODUCT_HAS_OPEN_ORDERS');
      await this.products.remove(storeId, productId, actor);
    });
  }

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
        ...stageWrite(input.confirm ? staffConfirmation : { to: 'to_confirm' }, now, input.confirm),
        paymentStatus: input.advancePaidPoisha > 0 ? 'advance_paid' : 'cod_pending',
        possibleDuplicateOfOrderId: duplicate,
        createdAt: now,
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
      const { expectedUpdatedAt, ...changes } = input;
      requireEditableOrder(order, expectedUpdatedAt);
      const delivery = await this.editedDelivery(storeId, input, order);
      const previous = await this.repository.items(storeId, orderId);
      const items = input.items ? await this.orderItems(storeId, input.items, previous) : previous;
      const totals = editedOrderTotals(items, order, input, delivery.deliveryChargePoisha);
      const now = this.clock.now();
      const possibleDuplicateOfOrderId = await this.repository.findDuplicate(storeId, {
        orderId,
        phone: delivery.recipientPhone,
        variantIds: items.map(({ variantId }) => variantId),
        since: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      });
      if (input.items) {
        await moveOrderReservations(
          storeId,
          this.products,
          { orderId, actor },
          { before: previous, after: items },
        );
        await this.repository.saveItems(
          storeId,
          orderId,
          items.map((item) => ({ ...item, createdAt: now })),
        );
      }
      await this.repository.updateOrder(storeId, orderId, {
        ...delivery,
        ...totals,
        possibleDuplicateOfOrderId,
        paymentStatus: totals.advancePaidPoisha > 0 ? 'advance_paid' : 'cod_pending',
        updatedAt: now,
      });
      await recordOrderEdit(
        storeId,
        orderId,
        { actor, occurredAt: now.toISOString(), changedFields: Object.keys(changes) },
        { audit: this.audit, outbox: this.outbox },
      );
      return this.getById(storeId, orderId, access);
    });
  }

  async list(
    storeId: string,
    query: OrderListQuery,
    seeFullPhone = false,
  ): Promise<OrderListResponse> {
    const overdueBefore = new Date(this.clock.now().getTime() - 12 * 60 * 60 * 1000);
    const parsedPhone = bdMobileSchema.safeParse(query.search);
    const phone = seeFullPhone && parsedPhone.success ? parsedPhone.data : undefined;
    const { stage, ...filters } = query;
    const stages = stage === undefined ? undefined : stagesForOrderTab(stage);
    const timeZone =
      query.createdFrom || query.createdThrough ? await this.stores.timeZone(storeId) : null;
    const rows = await this.repository.list(
      storeId,
      { ...filters, stages, timeZone },
      overdueBefore,
      phone,
    );
    const page = rows.slice(0, query.limit);
    const outcomes = await this.repository.parcelOutcomes(storeId, [
      ...new Set(page.map(({ recipientPhone }) => recipientPhone)),
    ]);
    const byPhone = new Map(outcomes.map((row) => [row.phone, row]));
    const items = page.map(({ recipientPhone, createdAt, ...row }) => ({
      ...row,
      createdAt: createdAt.toISOString(),
      totalPoisha: orderTotalPoisha(row),
      returnRisk: returnRisk(byPhone.get(recipientPhone)),
      isWaitingForConfirmation: row.stage === 'to_confirm' && createdAt < overdueBefore,
    }));
    return {
      items,
      counts: orderStageCounts(await this.repository.countByStage(storeId)),
      alerts: await this.repository.alertTotals(storeId, overdueBefore),
      nextCursor: rows.length > query.limit ? (items.at(-1)?.number ?? null) : null,
    };
  }

  async getById(storeId: string, orderId: string, access: Access): Promise<OrderDetail> {
    const order = await this.repository.find(storeId, orderId);
    if (!order) throw orderError('ORDER_NOT_FOUND');
    const outcomes = await this.repository.parcelOutcomes(storeId, [order.recipientPhone]);
    const timeline = await orderStageHistory(storeId, orderId, this.audit);
    return {
      ...order,
      recipientPhone: access.seeFullPhone ? order.recipientPhone : maskPhone(order.recipientPhone),
      possibleDuplicateOfOrderId: access.seeFullPhone ? order.possibleDuplicateOfOrderId : null,
      hasRecipientPhoneMatch: await this.contacts.hasOrderPhoneMatch(storeId, order, access),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      shippedAt: isoTime(order.shippedAt),
      deliveredAt: isoTime(order.deliveredAt),
      returnedAt: isoTime(order.returnedAt),
      codCollectedAt: isoTime(order.codCollectedAt),
      totalPoisha: orderTotalPoisha(order),
      returnRisk: returnRisk(outcomes[0]),
      items: await this.repository.items(storeId, orderId),
      timeline,
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
        await moveOrderReservations(
          storeId,
          this.products,
          { orderId, actor, reason: change.reason },
          { before: await this.repository.items(storeId, orderId), after: [] },
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
      if (change.to === 'cancelled') await this.attribution.clear(storeId, orderId);
      await recordOrderStage(
        storeId,
        orderId,
        { from: order.stage, change, actor, occurredAt: now.toISOString(), confirmed },
        { audit: this.audit, outbox: this.outbox },
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
    await moveOrderReservations(
      storeId,
      this.products,
      { orderId: id, actor },
      { before: [], after: items },
    );
    await this.repository.insertItems(
      storeId,
      id,
      items.map((item) => ({ ...item, createdAt })),
    );
    await this.contacts.markOrderLinked(storeId, buyerContactId, actor);
    await recordOrderCreation(storeId, order, actor, { audit: this.audit, outbox: this.outbox });
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
}

function isoTime(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}
