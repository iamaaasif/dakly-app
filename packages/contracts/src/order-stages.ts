// Fulfilment and money are separate fields. Allowed moves are in orders/order-stage.ts.
export const orderStages = [
  'to_confirm',
  'on_hold',
  'to_pack',
  'with_courier',
  'delivered',
  'partially_delivered',
  'returned',
  'cancelled',
] as const;

export type OrderStage = (typeof orderStages)[number];

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

export const editableOrderStages: readonly OrderStage[] = ['to_confirm', 'on_hold', 'to_pack'];

export const orderTabs = [
  'to_confirm',
  'to_pack',
  'with_courier',
  'delivered',
  'returned',
] as const;
