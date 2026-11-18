import type { OrderSummary } from '@dakly/contracts/orders';

export function canChangeOrderStage(
  order: Pick<OrderSummary, 'source'>,
  canEditOrders?: boolean,
): boolean {
  return canEditOrders === true && order.source !== 'shopify' && order.source !== 'woocommerce';
}

export function canConfirmOrder(
  order: Pick<OrderSummary, 'stage' | 'source'> | undefined,
  canEditOrders?: boolean,
): boolean {
  return (
    order !== undefined &&
    canChangeOrderStage(order, canEditOrders) &&
    (order.stage === 'to_confirm' || order.stage === 'on_hold')
  );
}

export function canEditOrder(order: OrderSummary | undefined, canEditOrders?: boolean): boolean {
  return (
    order !== undefined &&
    canChangeOrderStage(order, canEditOrders) &&
    ['to_confirm', 'on_hold', 'to_pack'].includes(order.stage) &&
    ['cod_pending', 'advance_paid'].includes(order.paymentStatus)
  );
}
