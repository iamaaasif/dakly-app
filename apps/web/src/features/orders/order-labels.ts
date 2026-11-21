import type {
  cancelReasons,
  onHoldReasons,
  OrderDetail,
  OrderStage,
  OrderSummary,
} from '@dakly/contracts/orders';

type OrderSource = OrderSummary['source'];

export const orderSourceLabels: Record<OrderSource, string> = {
  messenger: 'Messenger',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  comment: 'Comment',
  order_link: 'Order link',
  manual: 'Staff',
  pos_csv: 'POS CSV',
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  khata_import: 'Khata import',
};

export const onHoldReasonLabels: Record<(typeof onHoldReasons)[number], string> = {
  pre_order: 'Pre-order',
  cannot_reach: 'Could not reach the customer',
  waiting_for_advance: 'Waiting for advance',
  customer_asked_to_wait: 'Customer asked to wait',
  other: 'Other',
};

export const cancelReasonLabels: Record<(typeof cancelReasons)[number], string> = {
  not_confirmed: 'Not confirmed',
  out_of_stock: 'Out of stock',
  duplicate: 'Duplicate',
  fake: 'Fake order',
  test: 'Test order',
  wrong_order: 'Wrong order',
  customer_cancelled: 'Customer cancelled',
  other: 'Other',
};

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
