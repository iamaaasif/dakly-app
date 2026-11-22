import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ContactListQuery, ContactListResponse } from '@dakly/contracts/contacts';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useCustomers(query: ContactListQuery) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: customersKeys.list(contextTag, query),
    queryFn: ({ signal }) =>
      request<ContactListResponse>(`/contacts?${customersSearch(query)}`, { signal }),
    enabled: Boolean(contextTag),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

// `columns` shapes the screen only, so it is in the address but never in the API request.
export function customersSearch(query: Partial<ContactListQuery> & { columns?: string }) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query))
    if (value !== undefined) params.set(name, String(value));
  return params.toString();
}
