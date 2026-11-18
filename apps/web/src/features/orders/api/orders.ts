import { useQuery } from '@tanstack/react-query';

import type { OrderListQuery, OrderListResponse } from '@dakly/contracts/orders';

import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

const ordersKey = ['orders'] as const;

export function ordersSearch(query: Partial<OrderListQuery>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  return params.toString();
}

export function useOrders(query: OrderListQuery) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: [...ordersKey, contextTag, query],
    queryFn: ({ signal }) =>
      request<OrderListResponse>(`/orders?${ordersSearch(query)}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewOrders),
  });
}
