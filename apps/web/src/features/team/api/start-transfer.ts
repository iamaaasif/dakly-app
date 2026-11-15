import type { StartOwnershipTransferInput, OwnershipTransferResponse } from '@dakly/contracts/team';
import { useTeamMutation } from '../hooks/use-team-mutation';
export function useStartTransfer() {
  return useTeamMutation<StartOwnershipTransferInput, OwnershipTransferResponse>((request, input) =>
    request<OwnershipTransferResponse>('/store/ownership-transfer', {
      method: 'POST',
      body: input,
    }),
  );
}
