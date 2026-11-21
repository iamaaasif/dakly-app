import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CollectPaymentInput, RecordedDueEntryResponse } from '@dakly/contracts/due-book';

import { dueBookKeys } from './due-book-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useCollectPayment(contactId: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CollectPaymentInput) =>
      request<RecordedDueEntryResponse>(`/due-book/customers/${contactId}/payments`, {
        body: input,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: dueBookKeys.all }),
  });
}
