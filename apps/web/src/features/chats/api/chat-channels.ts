import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ChannelConnection } from '@dakly/contracts/channels';

import { aiAgentKeys } from './ai-agent-keys';
import { useStoreRequest } from '@/lib/store-request';

// A shop has a handful of Pages and Instagram accounts, so one page of 100 holds them all.
export function useChatChannels() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: aiAgentKeys.channels(contextTag),
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) =>
      request<{ items: ChannelConnection[] }>('/channel-connections?limit=100', { signal }),
  });
}

// No client timeout: the API runs every test question before it answers, which can take a minute.
export function useGoLive() {
  const { request, contextTag } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (channelConnectionId: string) =>
      request<void>(`/ai-agent/channel-connections/${channelConnectionId}/go-live`, {
        method: 'POST',
      }),
    // Also after a cut-off request: the API may have finished and gone live anyway.
    onSettled: () => client.invalidateQueries({ queryKey: aiAgentKeys.channels(contextTag) }),
  });
}
