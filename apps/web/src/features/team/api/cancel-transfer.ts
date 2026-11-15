import { useTeamMutation } from '../hooks/use-team-mutation';

export function useCancelTransfer(transferId: string) {
  return useTeamMutation<void, void>((request) =>
    request<void>(`/store/ownership-transfer/${transferId}`, { method: 'DELETE' }),
  );
}
