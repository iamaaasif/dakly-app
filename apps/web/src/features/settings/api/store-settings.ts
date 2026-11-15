import { useQuery } from '@tanstack/react-query';
import type { StoreSettingsResponse } from '@dakly/contracts/stores';
import { useStoreRequest } from '@/lib/store-request';
export const settingsKey = ['store-settings'] as const;
export function useStoreSettings() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...settingsKey, contextTag],
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) => request<StoreSettingsResponse>('/store', { signal }),
  });
}
