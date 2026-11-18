import type { OrderDetail, OrderStage } from '@dakly/contracts/orders';

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

export const courierLabels: Record<NonNullable<OrderDetail['courier']>, string> = {
  steadfast: 'Steadfast',
  pathao: 'Pathao',
  redx: 'RedX',
  own_delivery: 'Own delivery',
  other: 'Other',
};
