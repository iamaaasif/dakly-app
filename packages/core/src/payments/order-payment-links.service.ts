import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';
import type { CreateOrderPaymentLink, OrderPaymentLink } from '@dakly/contracts/payments';

import { OrderAdvancesService } from '../orders/order-advances.service';
import { Clock } from '../platform/clock';
import { loadEnv } from '../platform/config/env';
import { StoreTransaction } from '../platform/database/store-transaction';
import { AppError } from '../platform/errors/app-error';
import { HOUR_MS } from '../platform/time';
import { orderLinkAmount } from './order-link-amount';
import { PAYMENT_ERRORS } from './payments.errors';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

type Intent = NonNullable<Awaited<ReturnType<PaymentsRepository['find']>>>;

const orderPurposes: readonly string[] = ['order_advance', 'order_full'];

@Injectable()
export class OrderPaymentLinksService {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(PaymentsRepository) private readonly repository: PaymentsRepository,
    @Inject(OrderAdvancesService) private readonly orders: OrderAdvancesService,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // A new link voids the unpaid ones for the order, so only one amount is ever open (PAY-R7).
  create(storeId: string, orderId: string, input: CreateOrderPaymentLink, userId: string) {
    return this.transaction.run(storeId, async () => {
      const order = await this.orders.requestAdvance(storeId, orderId);
      const amountPoisha = orderLinkAmount(input, order);
      const now = this.clock.now();
      await this.repository.voidUnpaid(storeId, { orderId }, now);
      const intent = await this.payments.create(
        storeId,
        {
          flow: 'shop',
          purpose: input.kind === 'full' ? 'order_full' : 'order_advance',
          gateway: input.gateway,
          credentialId: input.credentialId,
          orderId,
          amountPoisha,
          expiresAt: new Date(now.getTime() + input.expiresInHours * HOUR_MS),
        },
        userId,
      );
      return toLink(intent);
    });
  }

  async list(storeId: string, orderId: string): Promise<OrderPaymentLink[]> {
    return (await this.repository.listForOrder(storeId, orderId)).map(toLink);
  }

  async void(storeId: string, orderId: string, intentId: string) {
    const voided = await this.repository.voidUnpaid(
      storeId,
      { orderId, id: intentId },
      this.clock.now(),
    );
    if (!voided)
      throw new AppError('PAYMENT_LINK_NOT_FOUND', PAYMENT_ERRORS.PAYMENT_LINK_NOT_FOUND);
  }

  // Called when a verified payment lands. The order gets the total received for it, so running
  // this twice for one payment changes nothing.
  recordPaid(storeId: string, intentId: string) {
    return this.transaction.run(storeId, async () => {
      const intent = await this.repository.find(storeId, intentId);
      if (!intent?.orderId || !orderPurposes.includes(intent.purpose)) return;
      const received = await this.repository.receivedForOrder(storeId, intent.orderId);
      const actor: AuditEntry['actor'] = { kind: 'system' };
      await this.orders.recordPaid(storeId, intent.orderId, received, actor);
    });
  }
}

function toLink(intent: Intent): OrderPaymentLink {
  return {
    id: intent.id,
    gateway: intent.gateway,
    kind: intent.purpose === 'order_full' ? 'full' : 'advance',
    amountPoisha: intent.amountPoisha,
    status: intent.status,
    isVoided: intent.voidedAt !== null,
    expiresAt: intent.expiresAt.toISOString(),
    url: `${loadEnv().SHORT_LINK_BASE_URL}/p/${intent.shortCode ?? ''}`,
  };
}
