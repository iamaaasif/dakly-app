import { useAccountMutation } from '../hooks/use-account-mutation';

export function usePasswordProof() {
  return useAccountMutation<void>((request) =>
    request<void>('/me/password/proof', { method: 'POST', body: {} }),
  );
}
