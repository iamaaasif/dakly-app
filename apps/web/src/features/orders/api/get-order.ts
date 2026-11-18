import { useQuery, type QueryClient } from '@tanstack/react-query';

import type { OrderDetail } from '@dakly/contracts/orders';

import { ordersKey } from './orders';
import { productsKeys } from '@/lib/product-query-keys';
import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

const orderDetailKey = (contextTag: string | undefined, id: string) =>
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

export function prepareOrderRefresh(
  client: QueryClient,
  contextTag: string | undefined,
  id: string,
) {
  const key = orderDetailKey(contextTag, id);
  const cached = client.getQueryCache().find({ queryKey: key });
  return async (order: OrderDetail) => {
    if (cached && client.getQueryCache().find({ queryKey: key }) === cached) {
      await client.cancelQueries({ queryKey: key });
      if (client.getQueryCache().find({ queryKey: key }) === cached)
        client.setQueryData(key, order);
    }
    void client.invalidateQueries({ queryKey: ordersKey });
    void client.invalidateQueries({ queryKey: productsKeys.all });
  };
}
