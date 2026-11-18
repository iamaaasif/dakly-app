import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type {
  OrderDetail,
  OrderListQuery,
  OrderListResponse,
  OrderStage,
  OrderStageChange,
} from '@dakly/contracts/orders';
import { maskPhone } from '@dakly/contracts/phone';
import type { StoreAccess } from '@dakly/contracts/team';

import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { ProductsService } from '../products/products.service';
import { orderStageTransitions } from './order-stage';
import { orderError } from './orders.errors';
import { OrdersRepository, type StageWrite } from './orders.repository';

type Access = Pick<StoreAccess, 'seeFullPhone'>;
type StageEditor = { actor: AuditEntry['actor']; access: Access };

@Injectable()
export class OrdersService {
  constructor(
    @Inject(OrdersRepository) private readonly repository: OrdersRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ProductsService) private readonly products: ProductsService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  async list(storeId: string, query: OrderListQuery): Promise<OrderListResponse> {
    const { items: rows, counts } = await this.repository.list(storeId, query);
    const items = rows.slice(0, query.limit).map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
    return {
      items,
      counts: {
        to_confirm: 0,
        on_hold: 0,
        to_pack: 0,
        with_courier: 0,
        delivered: 0,
        partially_delivered: 0,
        returned: 0,
        cancelled: 0,
        ...counts,
      },
      nextCursor: rows.length > query.limit ? (items.at(-1)?.number ?? null) : null,
    };
  }

  getById(storeId: string, orderId: string, access: Access): Promise<OrderDetail> {
    return this.transaction.run(storeId, async () => {
      const order = await this.repository.find(storeId, orderId);
      if (!order) throw orderError('ORDER_NOT_FOUND');
      return {
        ...order,
        recipientPhone: access.seeFullPhone
          ? order.recipientPhone
          : maskPhone(order.recipientPhone),
        createdAt: order.createdAt.toISOString(),
        items: await this.repository.items(storeId, orderId),
        timeline: await this.audit.orderStages(storeId, orderId),
      };
    });
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
      if (
        !orderStageTransitions[order.stage].includes(change.to) ||
        order.source === 'shopify' ||
        order.source === 'woocommerce'
      )
        throw orderError('ORDER_STAGE_NOT_ALLOWED');

      // Keep the audit timeline in transition order when clocks tie or drift.
      const now = new Date(Math.max(this.clock.now().getTime(), order.updatedAt.getTime() + 1));
      const confirmed = change.to === 'to_pack' && !order.confirmedAt;
      if (change.to === 'cancelled') {
        await this.releaseReservations(storeId, orderId, change.reason, actor);
      }
      await this.repository.setStage(storeId, orderId, stageWrite(change, now, confirmed));
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

  private async releaseReservations(
    storeId: string,
    orderId: string,
    reason: Extract<OrderStageChange, { to: 'cancelled' }>['reason'],
    actor: AuditEntry['actor'],
  ): Promise<void> {
    for (const item of await this.repository.items(storeId, orderId)) {
      if (!item.isStockTracked) continue;
      await this.products.moveStock(storeId, item.variantId, {
        kind: 'release',
        quantity: item.quantity,
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
    await this.audit.record(storeId, {
      actor,
      action: 'order.stage_changed',
      entityType: 'order',
      entityId: orderId,
      before: { stage: from },
      after: { stage: change.to },
      reason: 'reason' in change ? change.reason : undefined,
      occurredAt,
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
