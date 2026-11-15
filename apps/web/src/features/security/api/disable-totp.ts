import type { TotpDisableInput } from '@dakly/contracts/totp';
import { useAccountMutation } from '../hooks/use-account-mutation';
export function useDisableTotp() {
  return useAccountMutation<TotpDisableInput, void>((request, body) =>
    request<void>('/me/totp/disable', { method: 'POST', body }),
  );
}
