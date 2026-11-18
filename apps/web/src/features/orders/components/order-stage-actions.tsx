import { orderStageTransitions, type OrderDetail, type OrderStage } from '@dakly/contracts/orders';

import { canChangeOrderStage } from '../order-actions';

export type StageAction = Exclude<OrderStage, 'to_pack'> | 'cod';
export type StageFormAction = Exclude<StageAction, 'to_confirm' | 'delivered'>;

export const stageActionLabels: Record<StageAction, string> = {
  to_confirm: 'Back to confirmation',
  on_hold: 'Put on hold',
  with_courier: 'Sent with courier',
  delivered: 'Mark delivered',
  partially_delivered: 'Partly delivered',
  returned: 'Mark returned',
  cancelled: 'Cancel order',
  cod: 'Record COD collected',
};

export function orderStageActions(
  order: OrderDetail | undefined,
  canEditOrders: boolean | undefined,
): StageAction[] {
  if (!order || !canChangeOrderStage(order, canEditOrders)) return [];
  const { stage, paymentStatus } = order;
  const multipleUnits = order.items.length > 1 || order.items.some(({ quantity }) => quantity > 1);
  const stages: StageAction[] = orderStageTransitions[stage]
    .filter((next) => next !== 'to_pack')
    .filter((next) => next !== 'partially_delivered' || multipleUnits);
  if (
    (stage === 'delivered' || stage === 'partially_delivered') &&
    (paymentStatus === 'cod_pending' || paymentStatus === 'advance_paid')
  )
    stages.push('cod');
  return stages;
}
