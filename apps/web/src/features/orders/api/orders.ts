import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { OrderListQuery, OrderListResponse } from '@dakly/contracts/orders';

import type { OrdersNavigationQuery } from '../orders-url';
import { ordersKey } from '@/lib/order-entry/orders-key';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function ordersSearch({
  labelOrderIds,
  ...query
}: Partial<OrdersNavigationQuery> & { selected?: string }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  if (labelOrderIds?.length) params.set('labelOrderIds', labelOrderIds.join(','));
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
    placeholderData: keepPreviousData,
  });
}
