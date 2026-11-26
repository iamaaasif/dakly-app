import type { OrderDetail, OrderItem } from './orders';

export type OrderInvoice = Pick<
  OrderDetail,
  | 'number'
  | 'createdAt'
  | 'buyerName'
  | 'recipientName'
  | 'recipientPhone'
  | 'recipientAddress'
  | 'recipientDistrict'
  | 'itemsSubtotalPoisha'
  | 'deliveryChargePoisha'
  | 'orderDiscountPoisha'
  | 'advancePaidPoisha'
  | 'codAmountPoisha'
> & {
  store: { name: string; phone: string | null; timeZone: string };
  isPartialDelivery: boolean;
  items: Pick<
    OrderItem,
    'id' | 'productName' | 'variantTitle' | 'quantity' | 'unitPricePoisha' | 'lineDiscountPoisha'
  >[];
};
