import { useQuery } from '@tanstack/react-query';

import type { SmsSenderIdListResponse } from '@dakly/contracts/sms-senders';

import { integrationsKeys } from './integrations-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useSmsSenderIds(limit = 1) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: [...integrationsKeys.smsSenders(contextTag), limit],
    enabled: Boolean(contextTag),
    queryFn: ({ signal }) =>
      request<SmsSenderIdListResponse>(`/sms-sender-ids?limit=${limit}`, { signal }),
  });
}
