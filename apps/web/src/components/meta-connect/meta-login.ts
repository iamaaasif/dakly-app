import { useMutation } from '@tanstack/react-query';

import type {
  MetaAuthorizationAccounts,
  MetaAuthorizationInput,
  MetaAuthorizationStart,
  MetaSelectionInput,
} from '@dakly/contracts/channels';

import { useStoreRequest } from '@/lib/store-request';

export function useStartMetaLogin() {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: () =>
      request<MetaAuthorizationStart>('/channel-connections/meta/start', { method: 'POST' }),
  });
}

export function useListMetaAccounts() {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: (body: MetaAuthorizationInput) =>
      request<MetaAuthorizationAccounts>('/channel-connections/meta/accounts', {
        method: 'POST',
        body,
      }),
  });
}

export function useConnectMetaAccounts() {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: (body: MetaSelectionInput) =>
      request<{ ids: string[] }>('/channel-connections/meta', { method: 'POST', body }),
  });
}
