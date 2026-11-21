import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ChangeStoreExtensionsInput, StoreSettingsResponse } from '@dakly/contracts/stores';

import { notifySessionChange } from '@/lib/notify-session-change';
import { useStoreRequest } from '@/lib/store-request';

const extensionKeys = (tag: string | undefined) => ['store-settings', 'extensions', tag] as const;

export function useStoreExtensions() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: extensionKeys(contextTag),
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) => request<StoreSettingsResponse>('/store', { signal }),
  });
}

export function useChangeExtensions() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangeStoreExtensionsInput) =>
      request<StoreSettingsResponse>('/store/extensions', { method: 'PATCH', body }),
    onSuccess: async () => {
      window.dispatchEvent(new Event('dakly-context-changed'));
      notifySessionChange();
      await client.invalidateQueries({ queryKey: ['store-settings'] });
    },
  });
}
