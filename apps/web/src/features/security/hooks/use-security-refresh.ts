import { useQueryClient } from '@tanstack/react-query';

import { securityKeys } from '../api/security-keys';
import { notifySessionChange } from '@/lib/notify-session-change';

export function useSecurityRefresh() {
  const client = useQueryClient();
  return async () => {
    window.dispatchEvent(new Event('dakly-context-changed'));
    notifySessionChange();
    await Promise.all([
      client.invalidateQueries({ queryKey: securityKeys.account }),
      client.invalidateQueries({ queryKey: securityKeys.history }),
    ]);
  };
}
