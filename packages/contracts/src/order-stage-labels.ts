import type { OrderStage } from './orders';

export const orderStageLabels: Record<OrderStage, string> = {
  to_confirm: 'To confirm',
  on_hold: 'On hold',
  to_pack: 'To pack',
  with_courier: 'With courier',
  delivered: 'Delivered',
  partially_delivered: 'Partly delivered',
  returned: 'Returned',
  cancelled: 'Cancelled',
};
