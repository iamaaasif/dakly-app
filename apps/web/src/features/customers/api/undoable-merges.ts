import { useQuery } from '@tanstack/react-query';

import type { ContactMergeResponse } from '@dakly/contracts/contacts';

import { mergesKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useUndoableMerges(contactId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: mergesKeys.forContact(contextTag, contactId),
    queryFn: ({ signal }) =>
      request<ContactMergeResponse[]>(`/contact-merges?contactId=${contactId}`, { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}
