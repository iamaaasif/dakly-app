import type { OrderDetail, OrderStage, OrderStageChange } from '@dakly/contracts/orders';
import { Button } from '@dakly/ui/button';

import { canChangeOrderStage } from '../order-actions';

export const stageActionLabels = {
  to_confirm: 'Back to confirmation',
  on_hold: 'Put on hold',
  with_courier: 'Sent with courier',
  delivered: 'Mark delivered',
  partially_delivered: 'Partly delivered',
  returned: 'Mark returned',
  cancelled: 'Cancel order',
  cod: 'Record COD collected',
} as const;

export type StageAction = keyof typeof stageActionLabels;
export type StageFormAction = Exclude<StageAction, 'to_confirm' | 'delivered'>;

const actionsByStage: Record<OrderStage, readonly StageAction[]> = {
  to_confirm: ['on_hold', 'cancelled'],
  on_hold: ['to_confirm', 'cancelled'],
  to_pack: ['with_courier', 'on_hold', 'cancelled'],
  with_courier: ['delivered', 'partially_delivered', 'returned'],
  delivered: ['returned'],
  partially_delivered: ['returned'],
  returned: [],
  cancelled: [],
};

export function orderStageActions(
  order: OrderDetail | undefined,
  canEditOrders: boolean | undefined,
): readonly StageAction[] {
  if (!order || !canChangeOrderStage(order, canEditOrders)) return [];
  const { stage, paymentStatus } = order;
  const canRecordCod =
    (stage === 'delivered' || stage === 'partially_delivered') &&
    (paymentStatus === 'cod_pending' || paymentStatus === 'advance_paid');
  return canRecordCod ? [...actionsByStage[stage], 'cod'] : actionsByStage[stage];
}

type StageActionsProps = {
  actions: readonly StageAction[];
  pending: boolean;
  hasPrimary: boolean;
  onChange: (change: OrderStageChange, button: HTMLButtonElement) => void;
  onForm: (action: StageFormAction) => void;
};

export function OrderStageActions({
  actions,
  pending,
  hasPrimary,
  onChange,
  onForm,
}: StageActionsProps) {
  return actions.map((action, index) => (
    <Button
      key={action}
      variant={!hasPrimary && index === 0 ? 'primary' : 'secondary'}
      disabled={pending}
      onClick={(event) => {
        if (action === 'to_confirm' || action === 'delivered')
          onChange({ to: action }, event.currentTarget);
        else onForm(action);
      }}
    >
      {stageActionLabels[action]}
    </Button>
  ));
}
