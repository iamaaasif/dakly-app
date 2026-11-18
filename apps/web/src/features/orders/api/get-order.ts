import { useQuery, type QueryClient } from '@tanstack/react-query';

import type { OrderDetail } from '@dakly/contracts/orders';

import { ordersKey } from './orders';
import { productsKeys } from '@/lib/product-query-keys';
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

export function prepareOrderRefresh(
  client: QueryClient,
  contextTag: string | undefined,
  id: string,
) {
  const original = client.getQueryCache().find<OrderDetail>({
    queryKey: orderDetailKey(contextTag, id),
    exact: true,
  });
  return async (order: OrderDetail) => {
    await original?.cancel({ revert: true });
    // A shop switch can remove the detail query while the order update is in flight.
    const cache = client.getQueryCache();
    const saved = original && cache.get(original.queryHash) === original ? original : undefined;
    saved?.setData(order, { manual: true });
    void client.invalidateQueries({ queryKey: ordersKey, predicate: (query) => query !== saved });
    void client.invalidateQueries({ queryKey: productsKeys.all });
  };
}
