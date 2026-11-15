import { useMutation } from '@tanstack/react-query';
import { useAccountRequest } from '@/lib/account-request';
export function useAccountMutation<Input, Output = void>(
  mutation: (
    request: ReturnType<typeof useAccountRequest>['request'],
    input: Input,
  ) => Promise<Output>,
) {
  const { request } = useAccountRequest();
  return useMutation({ gcTime: 0, mutationFn: (input: Input) => mutation(request, input) });
}
