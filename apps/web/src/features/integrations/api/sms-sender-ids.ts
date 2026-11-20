import { useQuery } from '@tanstack/react-query';

import type { SmsSenderIdListResponse } from '@dakly/contracts/sms-senders';

import { integrationsKeys } from './integrations-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useSmsSenderIds() {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: integrationsKeys.smsSenders(contextTag),
    enabled: Boolean(contextTag),
    queryFn: ({ signal }) =>
      request<SmsSenderIdListResponse>('/sms-sender-ids?limit=1', { signal }),
  });
}
