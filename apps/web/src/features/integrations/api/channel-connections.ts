import { useQuery } from '@tanstack/react-query';

import type { ChannelConnection } from '@dakly/contracts/channels';

import { integrationsKeys } from './integrations-keys';
import { useStoreRequest } from '@/lib/store-request';

// A shop has a handful of Pages and Instagram accounts, so one page of 100 holds them all.
export function useChannelConnections() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: integrationsKeys.connections(contextTag),
    enabled: Boolean(contextTag),
    queryFn: ({ signal }) =>
      request<{ items: ChannelConnection[]; nextCursor: string | null }>(
        '/channel-connections?limit=100',
        { signal },
      ),
  });
}
