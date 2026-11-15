import { useAccountMutation } from '../hooks/use-account-mutation';
export function useTotpProof() {
  return useAccountMutation<void>((request) =>
    request<void>('/me/totp/proof', { method: 'POST', body: {} }),
  );
}
