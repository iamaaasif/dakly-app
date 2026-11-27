import { useQuery } from '@tanstack/react-query';

import type { ContactCountsResponse } from '@dakly/contracts/contacts';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

// The Contacts page counts everyone, ordered or not.
export function useContactCounts() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: customersKeys.counts(contextTag),
    queryFn: ({ signal }) => request<ContactCountsResponse>('/contacts/counts', { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}
