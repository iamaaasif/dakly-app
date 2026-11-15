import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useStoreRequest } from '@/lib/store-request';
import { notifySessionChange } from '@/lib/notify-session-change';
import { teamKeys } from '../api/team-keys';
export function useTeamMutation<Input, Output>(
  mutation: (
    request: ReturnType<typeof useStoreRequest>['request'],
    input: Input,
  ) => Promise<Output>,
) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (input: Input) => mutation(request, input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: teamKeys.all });
      notifySessionChange();
      window.dispatchEvent(new Event('dakly-context-changed'));
    },
  });
}
