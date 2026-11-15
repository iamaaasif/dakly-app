import type {
  AcceptOwnershipTransferInput,
  OwnershipTransferResponse,
} from '@dakly/contracts/team';
import { useTeamMutation } from '../hooks/use-team-mutation';
export function useAcceptTransfer() {
  return useTeamMutation<AcceptOwnershipTransferInput, OwnershipTransferResponse>(
    (request, input) =>
      request<OwnershipTransferResponse>('/store/ownership-transfer/accept', {
        method: 'POST',
        body: input,
      }),
  );
}
