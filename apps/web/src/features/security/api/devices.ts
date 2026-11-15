import { useQuery } from '@tanstack/react-query';

import type { DeviceSessionPage } from '@dakly/contracts/sessions';

import { securityKeys } from './security-keys';
import { useAccountRequest } from '@/lib/account-request';

export function useDevices(before?: string) {
  const { request, contextTag } = useAccountRequest();
  return useQuery({
    queryKey: securityKeys.devices(contextTag, before),
    enabled: Boolean(contextTag),
    retry: false,
    queryFn: ({ signal }) =>
      request<DeviceSessionPage>(`/me/sessions${before ? '?before=' + before : ''}`, { signal }),
  });
}
