import { useQuery } from '@tanstack/react-query';

import type { StoreSettingsResponse } from '@dakly/contracts/stores';

import { contentKeys } from './content-keys';
import { useStoreRequest } from '@/lib/store-request';

// What the shop gave at sign-up, read from Store settings. People without access to those settings get nothing.
export function useStoreDetails() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...contentKeys.brand(contextTag), 'store-details'],
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) => request<StoreSettingsResponse>('/store', { signal }),
  });
}
