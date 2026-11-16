import { useMutation } from '@tanstack/react-query';

import type { ContactResponse, CreateContactInput } from '@dakly/contracts/contacts';

import { useStoreRequest } from '@/lib/store-request';

export function useCreateCustomer() {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: (input: CreateContactInput) =>
      request<ContactResponse>('/contacts', { body: input }),
  });
}
