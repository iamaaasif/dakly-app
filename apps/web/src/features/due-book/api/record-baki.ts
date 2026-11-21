import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ContactListResponse, ContactResponse } from '@dakly/contracts/contacts';
import type { RecordBakiInput, RecordedDueEntryResponse } from '@dakly/contracts/due-book';

import { dueBookKeys } from './due-book-keys';
import { useStoreRequest } from '@/lib/store-request';

export type AddBakiInput = RecordBakiInput & { name: string; phone: string };

// The form takes a phone, so the customer is found by it first and made only when no one has it.
export function useRecordBaki() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, phone, ...baki }: AddBakiInput) => {
      const found = await request<ContactListResponse>(
        `/contacts?${new URLSearchParams({ search: phone, limit: '1' })}`,
      );
      const contactId =
        found.items[0]?.id ??
        (await request<ContactResponse>('/contacts', { body: { name, phone } })).id;
      return request<RecordedDueEntryResponse>(`/due-book/customers/${contactId}/baki`, {
        body: baki,
      });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: dueBookKeys.all }),
  });
}
