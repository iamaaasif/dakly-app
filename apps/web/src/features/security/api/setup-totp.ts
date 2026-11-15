import type { TotpSetupInput, TotpSetupResponse } from '@dakly/contracts/totp';
import { useAccountMutation } from '../hooks/use-account-mutation';
export function useSetupTotp() {
  return useAccountMutation<TotpSetupInput, TotpSetupResponse>((request, body) =>
    request<TotpSetupResponse>('/me/totp/setup', { method: 'POST', body }),
  );
}
