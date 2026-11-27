import { useQuery } from '@tanstack/react-query';

import type { OrderCustomerLookup, OrderCustomerLookupQuery } from '@dakly/contracts/order-entry';

import { useStoreRequest } from '@/lib/store-request';

export function useOrderCustomerLookup(query: OrderCustomerLookupQuery | undefined) {
  const { contextTag, request } = useStoreRequest();
  const params = query ? new URLSearchParams(query).toString() : '';
  return useQuery({
    queryKey: ['order-customer-lookup', contextTag, params],
    queryFn: ({ signal }) =>
      request<OrderCustomerLookup>(`/orders/customer-lookup?${params}`, { signal }),
    enabled: Boolean(contextTag && query),
    retry: false,
    staleTime: 30_000,
  });
}
