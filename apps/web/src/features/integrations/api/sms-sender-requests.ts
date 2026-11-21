import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { RequestSmsSenderIdInput, SmsSenderIdResponse } from '@dakly/contracts/sms-senders';

import { integrationsKeys } from './integrations-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useRequestSmsSender() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RequestSmsSenderIdInput) =>
      request<SmsSenderIdResponse>('/sms-sender-ids', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: integrationsKeys.all }),
  });
}

export function useSendTestSms(smsSenderIdId: string) {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: () =>
      request<void>(`/sms-sender-ids/${smsSenderIdId}/test`, { method: 'POST', body: {} }),
  });
}
