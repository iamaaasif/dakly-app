import { useQuery } from '@tanstack/react-query';

import type { DueHistoryResponse } from '@dakly/contracts/due-book';

import { dueBookKeys } from './due-book-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useDueHistory(contactId: string, enabled: boolean) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: dueBookKeys.history(contextTag, contactId),
    queryFn: ({ signal }) =>
      request<DueHistoryResponse>(`/due-book/customers/${contactId}/entries?limit=50`, { signal }),
    enabled: enabled && Boolean(contextTag),
    retry: false,
  });
}
