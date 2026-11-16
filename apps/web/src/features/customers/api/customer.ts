import { useQuery } from '@tanstack/react-query';

import type { ContactDetailResponse } from '@dakly/contracts/contacts';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useCustomer(contactId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: customersKeys.detail(contextTag, contactId),
    queryFn: ({ signal }) => request<ContactDetailResponse>(`/contacts/${contactId}`, { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}
