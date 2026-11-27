import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ConsentResponse, RecordConsentInput } from '@dakly/contracts/contacts';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useRecordConsent(contactId: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordConsentInput) =>
      request<ConsentResponse>(`/contacts/${contactId}/consents`, { body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: customersKeys.all }),
  });
}
