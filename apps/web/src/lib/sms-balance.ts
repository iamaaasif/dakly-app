import { useQuery } from '@tanstack/react-query';

import type { WalletBalancesResponse } from '@dakly/contracts/wallets';

import { useStoreRequest } from '@/lib/store-request';

// Reading balances needs the billing permission, which a campaign editor may lack. A refusal
// means the balance row is left out, so there is no retry.
export function useSmsBalance(enabled: boolean) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: ['wallets', contextTag],
    enabled: enabled && Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) => request<WalletBalancesResponse>('/wallets', { signal }),
  });
}
