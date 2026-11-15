import { useMutation } from '@tanstack/react-query';

import type { CreateCustomerInput, CustomerResponse } from '@dakly/contracts/customers';

import { useStoreRequest } from '@/lib/store-request';

export function useCreateCustomer() {
  const { request } = useStoreRequest();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      request<CustomerResponse>('/customers', { body: input }),
  });
}
