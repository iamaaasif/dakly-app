import type { OrderStage } from '@dakly/contracts/orders';

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
