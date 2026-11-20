import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { OutboxService } from '../platform/outbox/outbox.service';
import { OrderAttributionRepository, type AttributionWrite } from './order-attribution.repository';

type OrderAttribution = NonNullable<Awaited<ReturnType<OrderAttributionRepository['find']>>>;
type BuyerSnapshot = Pick<
  OrderAttribution,
  'buyerContactId' | 'recipientPhone' | 'isRecipientBuyer'
>;
type Reference = Omit<AttributionWrite, 'amountPoisha'>;
type Selection = Reference & { buyer: BuyerSnapshot };

@Injectable()
export class OrderAttributionService {
  constructor(
    @Inject(OrderAttributionRepository) private readonly repository: OrderAttributionRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  find(storeId: string, orderId: string) {
    return this.repository.find(storeId, orderId);
  }

  rebuildPage(storeId: string, range: Parameters<OrderAttributionRepository['rebuildPage']>[1]) {
    return this.repository.rebuildPage(storeId, range);
  }

  record(storeId: string, orderId: string, selection: Selection) {
    return this.transaction.run(storeId, async () => {
      const order = await this.repository.find(storeId, orderId, 'no key update');
      if (!order || order.stage === 'cancelled' || !order.buyerContactId || order.sourceType)
        return;
      const { buyer, ...reference } = selection;
      if (!sameBuyer(order, buyer)) return;
      await this.write(storeId, orderId, {
        ...reference,
        amountPoisha: order.itemsSubtotalPoisha - order.orderDiscountPoisha,
      });
    });
  }

  rebuild(storeId: string, orderId: string, buyer: BuyerSnapshot, reference: Reference | null) {
    return this.transaction.run(storeId, async () => {
      const order = await this.repository.find(storeId, orderId, 'no key update');
      if (!order || order.stage === 'cancelled') return;
      if (!sameBuyer(order, buyer))
        throw new Error('Order buyer changed during attribution rebuild');
      if (!reference) {
        if (order.sourceType) await this.write(storeId, orderId, null);
        return;
      }
      const same = sameTouch(order, reference);
      if (same && order.windowDays === reference.windowDays) return;
      const currentAmount = order.itemsSubtotalPoisha - order.orderDiscountPoisha;
      const amountPoisha = same ? (order.amountPoisha ?? currentAmount) : currentAmount;
      await this.write(storeId, orderId, { ...reference, amountPoisha });
    });
  }

  clear(storeId: string, orderId: string) {
    return this.transaction.run(storeId, async () => {
      const order = await this.repository.find(storeId, orderId, 'no key update');
      if (order?.sourceType) await this.write(storeId, orderId, null);
    });
  }

  private async write(storeId: string, orderId: string, record: AttributionWrite | null) {
    await this.repository.save(storeId, orderId, record);
    const occurredAt = this.clock.now().toISOString();
    await this.outbox.publish(
      record
        ? {
            type: 'attribution.created',
            storeId,
            occurredAt,
            payload: { orderId, sourceType: record.sourceType, sourceId: record.sourceId },
          }
        : { type: 'attribution.removed', storeId, occurredAt, payload: { orderId } },
    );
  }
}

function sameBuyer(order: BuyerSnapshot, buyer: BuyerSnapshot) {
  return (
    order.buyerContactId === buyer.buyerContactId &&
    order.isRecipientBuyer === buyer.isRecipientBuyer &&
    (!order.isRecipientBuyer || order.recipientPhone === buyer.recipientPhone)
  );
}

function sameTouch(order: OrderAttribution, reference: Reference) {
  return (
    order.sourceType === reference.sourceType &&
    order.sourceId === reference.sourceId &&
    order.channel === reference.channel &&
    order.touchId === reference.touchId &&
    order.touchAt?.getTime() === reference.touchAt.getTime()
  );
}
