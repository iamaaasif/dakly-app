import { z } from 'zod';

import type { AuditEntry } from '@dakly/contracts/audit';
import {
  editableOrderStages,
  editablePaymentStatuses,
  orderStages,
  orderTabs,
  type OrderDetail,
  type OrderStage,
  type OrderStageChange,
} from '@dakly/contracts/orders';

import type { AuditService } from '../audit/audit.service';
import type { OutboxService } from '../platform/outbox/outbox.service';
import { orderError } from './orders.errors';
import type { StageWrite } from './orders.repository';

export const staffConfirmation = { to: 'to_pack' } as const;

export const productArchiveStages: OrderStage[] = ['to_confirm', 'on_hold', 'to_pack'];

const groupedStages: Partial<Record<OrderStage, OrderStage[]>> = {
  to_confirm: ['to_confirm', 'on_hold'],
  delivered: ['delivered', 'partially_delivered'],
};

export function stagesForOrderTab(stage: OrderStage): OrderStage[] {
  return groupedStages[stage] ?? [stage];
}

export function orderStageCounts(rows: { stage: OrderStage; count: number }[]) {
  const counts = Object.fromEntries(orderStages.map((stage) => [stage, 0])) as Record<
    OrderStage,
    number
  >;
  for (const { stage, count } of rows) counts[stage] = count;
  return {
    ...counts,
    ...Object.fromEntries(
      orderTabs.map((tab) => [
        tab,
        stagesForOrderTab(tab).reduce((sum, stage) => sum + counts[stage], 0),
      ]),
    ),
  };
}

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

export function requireEditableOrder(
  order: Pick<OrderDetail, 'source' | 'stage' | 'paymentStatus'> & { updatedAt: Date },
  expectedUpdatedAt?: string,
): void {
  if (
    isSyncedOrder(order.source) ||
    !editableOrderStages.includes(order.stage) ||
    !editablePaymentStatuses.includes(order.paymentStatus)
  )
    throw orderError('ORDER_NOT_EDITABLE');
  if (expectedUpdatedAt && expectedUpdatedAt !== order.updatedAt.toISOString())
    throw orderError('ORDER_CHANGED');
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

export async function recordOrderCreation(
  storeId: string,
  { id, stage, createdAt }: { id: string; stage?: OrderStage; createdAt: Date },
  actor: AuditEntry['actor'],
  services: { audit: AuditService; outbox: OutboxService },
): Promise<void> {
  const occurredAt = createdAt.toISOString();
  await services.outbox.publish({
    type: 'order.created',
    storeId,
    occurredAt,
    payload: { orderId: id },
  });
  if (stage === staffConfirmation.to)
    await recordOrderStage(
      storeId,
      id,
      { from: 'to_confirm', change: staffConfirmation, actor, occurredAt, confirmed: true },
      services,
    );
}

export async function recordOrderEdit(
  storeId: string,
  orderId: string,
  {
    actor,
    occurredAt,
    changedFields,
  }: {
    actor: AuditEntry['actor'];
    occurredAt: string;
    changedFields: string[];
  },
  { audit, outbox }: { audit: AuditService; outbox: OutboxService },
) {
  await audit.record(storeId, {
    action: 'order.edited',
    entityType: 'order',
    entityId: orderId,
    actor,
    after: { changedFields },
  });
  await outbox.publish({ type: 'order.edited', storeId, occurredAt, payload: { orderId } });
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
