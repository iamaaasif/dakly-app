import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ChangeStoreSettingsInput, StoreSettingsResponse } from '@dakly/contracts/stores';

import { settingsKeys } from './settings-keys';
import { notifySessionChange } from '@/lib/notify-session-change';
import { useStoreRequest } from '@/lib/store-request';

export function useChangeSettings() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangeStoreSettingsInput) =>
      request<StoreSettingsResponse>('/store', { method: 'PATCH', body }),
    onSuccess: async () => {
      window.dispatchEvent(new Event('dakly-context-changed'));
      notifySessionChange();
      await client.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}
