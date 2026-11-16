import { useMutation } from '@tanstack/react-query';

import type { CreateContactInput } from '@dakly/contracts/contacts';
import type { SupportCustomerResponse } from '@dakly/contracts/support';

import { supportRequest } from './support-request';

export function useSupportCreate(contextTag: string) {
  return useMutation({
    mutationFn: (input: CreateContactInput) =>
      supportRequest<SupportCustomerResponse>('/support/api/customers', {
        body: input,
        contextTag,
      }),
  });
}
