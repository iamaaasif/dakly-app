import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  OrderDetail,
  OrderListQuery,
  OrderListResponse,
  OrderStageChange,
} from '@dakly/contracts/orders';

import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

const ordersKey = ['orders'] as const;

export function ordersSearch(query: Partial<OrderListQuery> & { selected?: string }) {
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

export function useOrder(id: string) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: [...ordersKey, contextTag, 'detail', id],
    queryFn: ({ signal }) => request<OrderDetail>(`/orders/${id}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewOrders),
  });
}

export function useOrderStage(id: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: OrderStageChange) =>
      request<OrderDetail>(`/orders/${id}/stage`, { method: 'POST', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ordersKey }),
  });
}
