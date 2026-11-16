import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ContactResponse, CreateContactInput } from '@dakly/contracts/contacts';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useCreateCustomer() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContactInput) =>
      request<ContactResponse>('/contacts', { body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: customersKeys.all }),
  });
}
