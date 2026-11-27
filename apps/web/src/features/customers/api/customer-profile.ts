import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type {
  CustomerOrderResponse,
  CustomerPage,
  CustomerSummaryResponse,
} from '@dakly/contracts/customer-profile';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useCustomerSummary(contactId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: customersKeys.profile(contextTag, contactId, 'summary'),
    queryFn: ({ signal }) =>
      request<CustomerSummaryResponse>(`/contacts/${contactId}/summary`, { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}

function usePagedPart<Item>(contactId: string, part: 'orders') {
  const { request, contextTag } = useStoreRequest();
  return useInfiniteQuery({
    queryKey: customersKeys.profile(contextTag, contactId, part),
    enabled: Boolean(contextTag),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: CustomerPage<Item>) => page.nextCursor ?? undefined,
    queryFn: ({ pageParam, signal }) =>
      request<CustomerPage<Item>>(
        `/contacts/${contactId}/${part}?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        { signal },
      ),
  });
}

export const useCustomerOrders = (contactId: string) =>
  usePagedPart<CustomerOrderResponse>(contactId, 'orders');
