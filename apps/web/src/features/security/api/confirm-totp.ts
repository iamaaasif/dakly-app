import type { TotpConfirmInput, TotpConfirmResponse } from '@dakly/contracts/totp';

import { useAccountMutation } from '../hooks/use-account-mutation';

export function useConfirmTotp() {
  return useAccountMutation<TotpConfirmInput, TotpConfirmResponse>((request, body) =>
    request<TotpConfirmResponse>('/me/totp/confirm', { method: 'POST', body }),
  );
}
