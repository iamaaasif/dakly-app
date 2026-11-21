import { useQuery } from '@tanstack/react-query';

import type { ContactDetailResponse } from '@dakly/contracts/contacts';

import { khataKeys } from './khata-keys';
import { useStoreRequest } from '@/lib/store-request';

// Only the name and phone are shown, so the customer is read through the contacts route as it is.
export function useSuggestedCustomer(contactId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: khataKeys.suggested(contextTag, contactId),
    queryFn: ({ signal }) => request<ContactDetailResponse>(`/contacts/${contactId}`, { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}
