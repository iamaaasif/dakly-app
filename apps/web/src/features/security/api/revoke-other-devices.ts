import { useAccountMutation } from '../hooks/use-account-mutation';

export function useRevokeOtherDevices() {
  return useAccountMutation<void>((request) =>
    request<void>('/me/sessions/sign-out-others', { method: 'POST', body: {} }),
  );
}
