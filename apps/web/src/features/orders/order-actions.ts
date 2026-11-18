import type { OrderSummary } from '@dakly/contracts/orders';

export function canConfirmOrder(
  order: Pick<OrderSummary, 'stage' | 'source'> | undefined,
  canEditOrders?: boolean,
): boolean {
  return (
    canEditOrders === true &&
    order !== undefined &&
    (order.stage === 'to_confirm' || order.stage === 'on_hold') &&
    order.source !== 'shopify' &&
    order.source !== 'woocommerce'
  );
}
