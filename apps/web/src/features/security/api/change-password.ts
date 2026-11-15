import type { ChangePasswordInput } from '@dakly/contracts/auth';
import { useAccountMutation } from '../hooks/use-account-mutation';
export function useChangePassword() {
  return useAccountMutation<ChangePasswordInput, void>((request, body) =>
    request<void>('/me/password', { method: 'POST', body }),
  );
}
