export const orderSources = [
  'messenger',
  'instagram',
  'whatsapp',
  'comment',
  'order_link',
  'manual',
  'pos_csv',
  'shopify',
  'woocommerce',
] as const;
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
export const orderPaymentStatuses = [
  'cod_pending',
  'advance_requested',
  'advance_paid',
  'paid',
  'cod_collected',
  'refund_due',
  'refunded',
] as const;
// Recorded for the timeline and reports. None of them proves who owns a phone (D26).
export const orderConfirmationMethods = [
  'whatsapp_reply',
  'sms_link',
  'chat_reply',
  'staff',
  'advance_paid',
] as const;
export const onHoldReasons = [
  'pre_order',
  'cannot_reach',
  'waiting_for_advance',
  'customer_asked_to_wait',
  'other',
] as const;
export const cancelReasons = [
  'not_confirmed',
  'out_of_stock',
  'duplicate',
  'fake',
  'test',
  'wrong_order',
  'customer_cancelled',
  'other',
] as const;
export const couriers = ['steadfast', 'pathao', 'redx', 'own_delivery', 'other'] as const;
export const orderCreatorTypes = ['ai', 'user', 'customer', 'sync'] as const;
export const attributionSourceTypes = ['campaign', 'automation', 'post'] as const;
export const bdAreaKinds = ['division', 'district', 'upazila'] as const;
// A shop's own discount code, given in a campaign offer, a workflow step or by hand.
export const discountCodeKinds = ['percent', 'amount', 'free_delivery'] as const;
export const discountCodeSourceTypes = ['manual', 'campaign', 'automation'] as const;
