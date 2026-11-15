import { useQueryClient } from '@tanstack/react-query';

import { notifySessionChange } from '@/lib/notify-session-change';

export function useSecurityRefresh() {
  const client = useQueryClient();
  return async () => {
    window.dispatchEvent(new Event('dakly-context-changed'));
    notifySessionChange();
    await Promise.all([
      client.invalidateQueries({ queryKey: ['account-security'] }),
      client.invalidateQueries({ queryKey: ['security-history'] }),
    ]);
  };
}
