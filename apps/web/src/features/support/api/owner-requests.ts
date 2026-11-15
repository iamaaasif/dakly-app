import { useQuery } from '@tanstack/react-query';

import type { SupportGrantPage } from '@dakly/contracts/support';

import { supportKeys } from './support-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useOwnerSupport(before: string) {
  const store = useStoreRequest();
  return useQuery({
    queryKey: supportKeys.ownerRequestPage(store.contextTag, before),
    retry: false,
    queryFn: ({ signal }) =>
      store.request<SupportGrantPage>(`/support-access${before ? '?before=' + before : ''}`, {
        signal,
      }),
  });
}
