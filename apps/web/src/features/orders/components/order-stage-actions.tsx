import { orderStageTransitions, type OrderDetail } from '@dakly/contracts/orders';

import { canChangeOrderStage } from '../order-actions';

const beforeDispatch = ['to_confirm', 'on_hold', 'cancelled'] as const;

export type StageAction = (typeof beforeDispatch)[number];
export type StageFormAction = Exclude<StageAction, 'to_confirm'>;

export function orderStageActions(
  order: OrderDetail | undefined,
  canEditOrders: boolean | undefined,
): StageAction[] {
  if (!order || !canChangeOrderStage(order, canEditOrders)) return [];
  return orderStageTransitions[order.stage].filter((stage): stage is StageAction =>
    beforeDispatch.some((action) => action === stage),
  );
}
