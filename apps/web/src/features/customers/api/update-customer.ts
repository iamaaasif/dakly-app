import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ContactResponse, UpdateContactInput } from '@dakly/contracts/contacts';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useUpdateCustomer(contactId: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: UpdateContactInput) =>
      request<ContactResponse>(`/contacts/${contactId}`, { method: 'PATCH', body: change }),
    onSuccess: () => client.invalidateQueries({ queryKey: customersKeys.all }),
  });
}
