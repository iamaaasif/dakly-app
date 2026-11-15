import type { RequestEmailCodeInput } from '@dakly/contracts/auth';
import { useAccountMutation } from '../hooks/use-account-mutation';
export function useEmailProof() {
  return useAccountMutation<RequestEmailCodeInput, void>((request, body) =>
    request<void>('/me/email/proof', { method: 'POST', body }),
  );
}
