import { orderStageTransitions, type OrderDetail, type OrderStage } from '@dakly/contracts/orders';

import { canChangeOrderStage } from '../order-actions';

export type StageAction = OrderStage | 'cod';
export type StageFormAction = Exclude<StageAction, 'to_confirm' | 'to_pack' | 'delivered'>;

export const stageActionLabels: Record<StageAction, string> = {
  to_confirm: 'Back to confirmation',
  to_pack: 'Back to packing',
  on_hold: 'Put on hold',
  with_courier: 'Sent with courier',
  delivered: 'Mark delivered',
  partially_delivered: 'Partly delivered',
  returned: 'Mark returned',
  cancelled: 'Cancel order',
  cod: 'Record COD collected',
};

export function leavesDelivered(stage: OrderStage): boolean {
  return stage === 'delivered' || stage === 'partially_delivered';
}

export function reopensOrder(stage: OrderStage): boolean {
  return stage === 'returned' || stage === 'cancelled';
}

export function orderStageActions(
  order: OrderDetail | undefined,
  canEditOrders: boolean | undefined,
): StageAction[] {
  if (!order || !canChangeOrderStage(order, canEditOrders)) return [];
  const { stage, paymentStatus } = order;
  const multipleUnits = order.items.length > 1 || order.items.some(({ quantity }) => quantity > 1);
  const stages: StageAction[] = orderStageTransitions[stage]
    // Confirm covers the move to packing from the confirmation stages.
    .filter(
      (next) =>
        next !== 'to_pack' ||
        stage === 'with_courier' ||
        leavesDelivered(stage) ||
        reopensOrder(stage),
    )
    .filter((next) => next !== 'partially_delivered' || multipleUnits);
  if (
    leavesDelivered(stage) &&
    (paymentStatus === 'cod_pending' || paymentStatus === 'advance_paid')
  )
    stages.push('cod');
  return stages;
}
