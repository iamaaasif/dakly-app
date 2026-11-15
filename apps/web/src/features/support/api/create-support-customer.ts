import { useMutation } from '@tanstack/react-query';

import type { CreateCustomerInput } from '@dakly/contracts/customers';
import type { SupportCustomerResponse } from '@dakly/contracts/support';

import { supportRequest } from './support-request';

export function useSupportCreate(contextTag: string) {
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      supportRequest<SupportCustomerResponse>('/support/api/customers', {
        body: input,
        contextTag,
      }),
  });
}
