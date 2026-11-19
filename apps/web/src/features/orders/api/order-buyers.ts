import { useQuery } from '@tanstack/react-query';

import type { ContactListResponse } from '@dakly/contracts/contacts';

import { useStoreRequest } from '@/lib/store-request';

export function useOrderBuyers(term: string) {
  const { contextTag, request } = useStoreRequest();
  return useQuery({
    queryKey: ['order-buyers', contextTag, term],
    queryFn: ({ signal }) =>
      request<ContactListResponse>(
        `/contacts?${new URLSearchParams({ limit: '20', search: term })}`,
        { signal },
      ),
    enabled: Boolean(contextTag && term.length >= 3),
    retry: false,
  });
}
