import { useAccountMutation } from '../hooks/use-account-mutation';

export function useRevokeDevice() {
  return useAccountMutation<string>((request, id) =>
    request<void>(`/me/sessions/${id}`, { method: 'DELETE' }),
  );
}
