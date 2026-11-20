import { useMutation, useQueryClient } from '@tanstack/react-query';

import { integrationsKeys } from './integrations-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useDisconnectChannel(channelConnectionId: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<void>(`/channel-connections/${channelConnectionId}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: integrationsKeys.all }),
  });
}
