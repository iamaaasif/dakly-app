import { useMutation } from '@tanstack/react-query';

import type { ConsentResponse, RecordConsentInput } from '@dakly/contracts/contacts';

import { useStoreRequest } from '@/lib/store-request';

export function useRecordConsent(contactId: string) {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: (input: RecordConsentInput) =>
      request<ConsentResponse>(`/contacts/${contactId}/consents`, { body: input }),
  });
}
