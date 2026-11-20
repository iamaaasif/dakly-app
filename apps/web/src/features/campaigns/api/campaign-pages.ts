import { useQuery } from '@tanstack/react-query';

import type { ChannelConnection } from '@dakly/contracts/channels';

import { campaignKeys } from './campaigns-key';
import { useStoreRequest } from '@/lib/store-request';

// A shop has a handful of Pages, so one page of 100 holds them all.
export function useMessengerPages() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: campaignKeys.pages(contextTag),
    enabled: Boolean(contextTag),
    queryFn: async ({ signal }) => {
      const page = await request<{ items: ChannelConnection[] }>('/channel-connections?limit=100', {
        signal,
      });
      return page.items.filter(
        (connection) => connection.kind === 'facebook_page' && connection.status === 'active',
      );
    },
  });
}
