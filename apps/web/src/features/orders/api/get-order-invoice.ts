import { useQuery } from '@tanstack/react-query';

import type { OrderInvoice } from '@dakly/contracts/order-invoice';

import { ordersKey } from '@/lib/order-entry/orders-key';
import { useStoreRequest } from '@/lib/store-request';

export function useOrderInvoice(orderId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...ordersKey, contextTag, 'invoice', orderId],
    queryFn: ({ signal }) =>
      request<OrderInvoice>(`/orders/${encodeURIComponent(orderId)}/invoice`, { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}
