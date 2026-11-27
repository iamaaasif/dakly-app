import { useQuery } from '@tanstack/react-query';

import type { OrderShippingLabels } from '@dakly/contracts/order-shipping-labels';

import { ordersKey } from '@/lib/order-entry/orders-key';
import { useStoreRequest } from '@/lib/store-request';

export function useOrderShippingLabels(orderIds: string[]) {
  const { request, contextTag } = useStoreRequest();
  const search = new URLSearchParams({ orderIds: orderIds.join(',') });
  return useQuery({
    queryKey: [...ordersKey, contextTag, 'shipping-labels', orderIds],
    queryFn: ({ signal }) =>
      request<OrderShippingLabels>(`/orders/shipping-labels?${search}`, { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}
