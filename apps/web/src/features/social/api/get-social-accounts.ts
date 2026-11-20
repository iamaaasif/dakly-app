import { useQuery } from '@tanstack/react-query';

import type { ChannelConnection } from '@dakly/contracts/channels';

import { socialKeys } from './social-keys';
import { useStoreRequest } from '@/lib/store-request';

export type SocialAccount = ChannelConnection & { kind: 'facebook_page' | 'instagram' };

function isSocialAccount(connection: ChannelConnection): connection is SocialAccount {
  return (
    (connection.kind === 'facebook_page' || connection.kind === 'instagram') &&
    connection.status !== 'disconnected'
  );
}

// A shop has a handful of Pages and Instagram accounts, so one page of 100 holds them all.
export function useSocialAccounts() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: socialKeys.accounts(contextTag),
    enabled: Boolean(contextTag),
    queryFn: async ({ signal }) => {
      const page = await request<{ items: ChannelConnection[] }>('/channel-connections?limit=100', {
        signal,
      });
      // Facebook Pages first, then Instagram, as the design lists them.
      return page.items
        .filter(isSocialAccount)
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.connectedAt.localeCompare(b.connectedAt));
    },
  });
}
