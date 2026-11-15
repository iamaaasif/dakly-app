import type { VerifyNewEmailInput } from '@dakly/contracts/auth';
import { useAccountMutation } from '../hooks/use-account-mutation';
export function useVerifyEmail() {
  return useAccountMutation<VerifyNewEmailInput, void>((request, body) =>
    request<void>('/me/email/verify', { method: 'POST', body }),
  );
}
