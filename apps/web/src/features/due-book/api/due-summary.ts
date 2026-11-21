import { useQuery } from '@tanstack/react-query';

import type { DueSummaryResponse } from '@dakly/contracts/due-book';

import { dueBookKeys } from './due-book-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useDueSummary() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: dueBookKeys.summary(contextTag),
    queryFn: ({ signal }) => request<DueSummaryResponse>('/due-book/summary', { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}
