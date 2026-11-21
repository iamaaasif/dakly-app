import { Inject, Injectable } from '@nestjs/common';

import type { AuditEntry } from '@dakly/contracts/audit';

import { AuditService } from '../audit/audit.service';
import { Clock } from '../platform/clock';
import { StoreTransaction } from '../platform/database/store-transaction';
import { isSyncedOrder } from './order-stage';
import { orderTotalPoisha } from './order-totals';
import { orderError } from './orders.errors';
import { OrdersRepository } from './orders.repository';

const payableStages = ['to_confirm', 'to_pack'];
const payableStatuses = ['cod_pending', 'advance_requested', 'advance_paid'];

export type OrderPaymentTarget = {
  orderId: string;
  number: number;
  totalPoisha: number;
  deliveryChargePoisha: number;
  advancePaidPoisha: number;
};

// The payments feature asks for money through these methods, so an amount is always worked out
// from the order and never taken from a caller's own total.
@Injectable()
export class OrderAdvancesService {
  constructor(
    @Inject(OrdersRepository) private readonly repository: OrdersRepository,
    @Inject(StoreTransaction) private readonly transaction: StoreTransaction,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  // Moves a cash-on-delivery order to "waiting for advance" and returns what it can be paid.
  requestAdvance(storeId: string, orderId: string): Promise<OrderPaymentTarget> {
    return this.transaction.run(storeId, async () => {
      const order = await this.repository.lock(storeId, orderId);
      if (!order) throw orderError('ORDER_NOT_FOUND');
      if (
        isSyncedOrder(order.source) ||
        !payableStages.includes(order.stage) ||
        !payableStatuses.includes(order.paymentStatus)
      )
        throw orderError('ORDER_NOT_PAYABLE');
      if (order.paymentStatus === 'cod_pending') {
        await this.repository.updateOrder(storeId, orderId, {
          paymentStatus: 'advance_requested',
          updatedAt: this.clock.now(),
        });
      }
      return {
        orderId,
        number: order.number,
        totalPoisha: orderTotalPoisha(order),
        deliveryChargePoisha: order.deliveryChargePoisha,
        advancePaidPoisha: order.advancePaidPoisha,
      };
    });
  }

  // Sets the money received so far, so a repeated call changes nothing. An order cancelled while
  // a payment was still in flight shows "refund due" instead of paid.
  recordPaid(
    storeId: string,
    orderId: string,
    paidPoisha: number,
    actor: AuditEntry['actor'],
  ): Promise<void> {
    return this.transaction.run(storeId, async () => {
      const order = await this.repository.lock(storeId, orderId);
      if (!order) throw orderError('ORDER_NOT_FOUND');
      const total = orderTotalPoisha(order);
      const advancePaidPoisha = Math.min(paidPoisha, total);
      const paymentStatus =
        order.stage === 'cancelled' ? 'refund_due' : paidStatus(paidPoisha, total);
      if (order.advancePaidPoisha === advancePaidPoisha && order.paymentStatus === paymentStatus)
        return;
      await this.repository.updateOrder(storeId, orderId, {
        advancePaidPoisha,
        codAmountPoisha: total - advancePaidPoisha,
        paymentStatus,
        updatedAt: this.clock.now(),
      });
      await this.audit.record(storeId, {
        actor,
        action: 'order.advance_recorded',
        entityType: 'order',
        entityId: orderId,
        before: { state: order.paymentStatus },
        after: { state: paymentStatus, changedFields: ['advancePaidPoisha'] },
      });
    });
  }
}

function paidStatus(paidPoisha: number, total: number) {
  if (paidPoisha <= 0) return 'cod_pending';
  return paidPoisha >= total ? 'paid' : 'advance_paid';
}
