import {
  editableOrderStages,
  editablePaymentStatuses,
  type OrderSummary,
} from '@dakly/contracts/orders';

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
    editableOrderStages.includes(order.stage) &&
    editablePaymentStatuses.includes(order.paymentStatus)
  );
}

export function canMarkOrderDelivered(
  order: Pick<OrderSummary, 'stage' | 'source'>,
  canEditOrders?: boolean,
): boolean {
  return canChangeOrderStage(order, canEditOrders) && order.stage === 'with_courier';
}
