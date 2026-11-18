import { useQuery } from '@tanstack/react-query';

import type { OrderDetail } from '@dakly/contracts/orders';

import { ordersKey } from './orders';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export const orderDetailKey = (contextTag: string | undefined, id: string) =>
  [...ordersKey, contextTag, 'detail', id] as const;

export function useOrder(id: string) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: orderDetailKey(contextTag, id),
    queryFn: ({ signal }) => request<OrderDetail>(`/orders/${id}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewOrders),
  });
}
