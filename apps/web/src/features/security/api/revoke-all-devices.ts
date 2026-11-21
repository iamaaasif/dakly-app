import { useAccountMutation } from '../hooks/use-account-mutation';

export function useRevokeAllDevices() {
  return useAccountMutation<void>((request) =>
    request<void>('/me/sessions/sign-out-all', { method: 'POST', body: {} }),
  );
}
