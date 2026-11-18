import { useQuery } from '@tanstack/react-query';

import type { OrderDetail } from '@dakly/contracts/orders';

import { ordersKey } from './orders';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

export function useOrder(id: string) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: [...ordersKey, contextTag, 'detail', id],
    queryFn: ({ signal }) => request<OrderDetail>(`/orders/${id}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewOrders),
  });
}
