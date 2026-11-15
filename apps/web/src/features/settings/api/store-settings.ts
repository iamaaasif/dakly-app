import { useQuery } from '@tanstack/react-query';

import type { StoreSettingsResponse } from '@dakly/contracts/stores';

import { settingsKeys } from './settings-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useStoreSettings() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: settingsKeys.store(contextTag),
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) => request<StoreSettingsResponse>('/store', { signal }),
  });
}
