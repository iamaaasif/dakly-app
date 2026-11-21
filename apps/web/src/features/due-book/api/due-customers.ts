import { useInfiniteQuery } from '@tanstack/react-query';

import type { DueCustomerListResponse, DueListFilter } from '@dakly/contracts/due-book';

import { dueBookKeys } from './due-book-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useDueCustomers(filter: DueListFilter) {
  const { request, contextTag } = useStoreRequest();
  return useInfiniteQuery({
    queryKey: dueBookKeys.list(contextTag, filter),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ filter, limit: '50' });
      if (pageParam) params.set('cursor', pageParam);
      return request<DueCustomerListResponse>(`/due-book/customers?${params}`, { signal });
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(contextTag),
    retry: false,
  });
}
