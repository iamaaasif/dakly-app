import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { SupportSessionResponse } from '@dakly/contracts/support';

import { supportKeys } from './support-keys';
import { supportRequest } from './support-request';

// Polling stays until real-time updates exist (HOME-1).
const SUPPORT_SESSION_POLL_MS = 30 * 1000;

export function useSupportSession() {
  const client = useQueryClient();
  useEffect(() => {
    const changed = () => {
      void client.invalidateQueries({ queryKey: supportKeys.session });
    };
    window.addEventListener('dakly-support-changed', changed);
    return () => window.removeEventListener('dakly-support-changed', changed);
  }, [client]);
  return useQuery({
    queryKey: supportKeys.session,
    queryFn: ({ signal }) =>
      supportRequest<SupportSessionResponse>('/support/api/session', { signal }),
    refetchInterval: SUPPORT_SESSION_POLL_MS,
    retry: false,
  });
}
