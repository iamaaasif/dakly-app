import { z } from 'zod';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  orderStages,
  type OrderDetail,
  type OrderStage,
  type OrderStageChange,
} from '@dakly/contracts/orders';

import type { AuditService } from '../audit/audit.service';
import type { OutboxService } from '../platform/outbox/outbox.service';
import type { StageWrite } from './orders.repository';

export const orderStageTransitions: Record<OrderStage, readonly OrderStage[]> = {
  to_confirm: ['to_pack', 'on_hold', 'cancelled'],
  on_hold: ['to_confirm', 'to_pack', 'cancelled'],
  to_pack: ['with_courier', 'on_hold', 'cancelled'],
  with_courier: ['delivered', 'partially_delivered', 'returned'],
  delivered: ['returned'],
  partially_delivered: ['returned'],
  returned: [],
  cancelled: [],
};

export function stageWrite(change: OrderStageChange, now: Date, confirmed: boolean): StageWrite {
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

export function isSyncedOrder(source: OrderDetail['source']): boolean {
  return source === 'shopify' || source === 'woocommerce';
}

export function canEditOrder(
  order: Pick<OrderDetail, 'source' | 'stage' | 'paymentStatus'>,
): boolean {
  return (
    !isSyncedOrder(order.source) &&
    ['to_confirm', 'on_hold', 'to_pack'].includes(order.stage) &&
    ['cod_pending', 'advance_paid'].includes(order.paymentStatus)
  );
}

const stageSnapshot = z.object({ state: z.enum(orderStages) });

export async function orderStageHistory(storeId: string, orderId: string, audit: AuditService) {
  const history = await audit.history(storeId, {
    entityType: 'order',
    entityId: orderId,
    action: 'order.stage_changed',
  });
  return history.map(({ before, after, createdAt, ...row }) => ({
    ...row,
    from: stageSnapshot.parse(before).state,
    to: stageSnapshot.parse(after).state,
    occurredAt: createdAt.toISOString(),
  }));
}

export async function recordOrderStage(
  storeId: string,
  orderId: string,
  {
    from,
    change,
    actor,
    occurredAt,
    confirmed,
  }: {
    from: OrderStage;
    change: OrderStageChange;
    actor: AuditEntry['actor'];
    occurredAt: string;
    confirmed: boolean;
  },
  { audit, outbox }: { audit: AuditService; outbox: OutboxService },
): Promise<void> {
  const reason = 'reason' in change ? change.reason : undefined;
  await audit.record(storeId, {
    actor,
    action: 'order.stage_changed',
    entityType: 'order',
    entityId: orderId,
    before: { state: from },
    after: { state: change.to },
    reason: 'note' in change ? change.note : reason,
  });
  await outbox.publish({
    type: 'order.stage_changed',
    storeId,
    occurredAt,
    payload: { orderId, from, to: change.to },
  });
  if (confirmed)
    await outbox.publish({
      type: 'order.confirmed',
      storeId,
      occurredAt,
      payload: { orderId },
    });
}
