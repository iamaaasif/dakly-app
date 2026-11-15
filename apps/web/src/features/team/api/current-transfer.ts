import { useQuery } from '@tanstack/react-query';
import type { CurrentOwnershipTransferResponse } from '@dakly/contracts/team';
import { useStoreRequest } from '@/lib/store-request';
import { teamKeys } from './team-keys';
export function useCurrentTransfer() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: teamKeys.transfer(contextTag),
    queryFn: ({ signal }) =>
      request<CurrentOwnershipTransferResponse>('/store/ownership-transfer', { signal }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}
