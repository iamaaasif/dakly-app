import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChangeStoreExtensionsInput, StoreSettingsResponse } from '@dakly/contracts/stores';
import { useStoreRequest } from '@/lib/store-request';
import { notifySessionChange } from '@/lib/notify-session-change';
import { settingsKey } from './store-settings';
export function useChangeExtensions() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangeStoreExtensionsInput) =>
      request<StoreSettingsResponse>('/store/extensions', { method: 'PATCH', body }),
    onSuccess: async () => {
      window.dispatchEvent(new Event('dakly-context-changed'));
      notifySessionChange();
      await client.invalidateQueries({ queryKey: settingsKey });
    },
  });
}
