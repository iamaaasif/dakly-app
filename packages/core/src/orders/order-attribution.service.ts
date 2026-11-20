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
type Selection = Omit<AttributionWrite, 'amountPoisha'> & { buyer: BuyerSnapshot };

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

  record(storeId: string, orderId: string, selection: Selection) {
    return this.transaction.run(storeId, async () => {
      const order = await this.repository.find(storeId, orderId, 'no key update');
      if (!order || order.stage === 'cancelled' || !order.buyerContactId || order.sourceType)
        return;
      const { buyer, ...reference } = selection;
      if (!sameBuyer(order, buyer)) return;
      const amountPoisha = order.itemsSubtotalPoisha - order.orderDiscountPoisha;
      await this.repository.save(storeId, orderId, { ...reference, amountPoisha });
      await this.outbox.publish({
        type: 'attribution.created',
        storeId,
        occurredAt: this.clock.now().toISOString(),
        payload: { orderId, sourceType: reference.sourceType, sourceId: reference.sourceId },
      });
    });
  }

  clear(storeId: string, orderId: string) {
    return this.transaction.run(storeId, async () => {
      const order = await this.repository.find(storeId, orderId, 'no key update');
      if (!order?.sourceType) return;
      await this.repository.save(storeId, orderId, null);
      await this.outbox.publish({
        type: 'attribution.removed',
        storeId,
        occurredAt: this.clock.now().toISOString(),
        payload: { orderId },
      });
    });
  }
}

function sameBuyer(order: BuyerSnapshot, buyer: BuyerSnapshot) {
  return (
    order.buyerContactId === buyer.buyerContactId &&
    order.isRecipientBuyer === buyer.isRecipientBuyer &&
    (!order.isRecipientBuyer || order.recipientPhone === buyer.recipientPhone)
  );
}
