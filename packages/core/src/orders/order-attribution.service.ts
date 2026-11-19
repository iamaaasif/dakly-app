import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { OrderAttributionRepository, type AttributionWrite } from './order-attribution.repository';

export type OrderAttributionReference = Omit<AttributionWrite, 'amountPoisha'>;

@Injectable()
export class OrderAttributionService {
  constructor(
    @Inject(OrderAttributionRepository) private readonly repository: OrderAttributionRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  record(
    storeId: string,
    orderId: string,
    reference: OrderAttributionReference | null,
    _actor: AuditEntry['actor'],
  ) {
    return this.transaction.run(storeId, async () => {
      const order = await this.repository.lock(storeId, orderId);
      if (!order) return;
      const next = order.stage === 'cancelled' || !order.buyerContactId ? null : reference;
      if (next ? sameTouch(order, next) : !order.sourceType) return;

      const amountPoisha = order.itemsSubtotalPoisha - order.orderDiscountPoisha;
      await this.repository.save(storeId, orderId, next && { ...next, amountPoisha });
      const occurredAt = this.clock.now().toISOString();
      await this.outbox.publish(
        next
          ? {
              type: 'attribution.created',
              storeId,
              occurredAt,
              payload: { orderId, sourceType: next.sourceType, sourceId: next.sourceId },
            }
          : { type: 'attribution.removed', storeId, occurredAt, payload: { orderId } },
      );
    });
  }
}

type OrderAttribution = NonNullable<Awaited<ReturnType<OrderAttributionRepository['lock']>>>;

function sameTouch(order: OrderAttribution, reference: OrderAttributionReference) {
  return (
    order.sourceType === reference.sourceType &&
    order.sourceId === reference.sourceId &&
    order.channel === reference.channel &&
    order.touchId === reference.touchId &&
    order.touchAt?.getTime() === reference.touchAt.getTime() &&
    order.windowDays === reference.windowDays
  );
}
