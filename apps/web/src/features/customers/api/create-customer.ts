import { useMutation } from '@tanstack/react-query';
import type { CreateCustomerInput, CustomerResponse } from '@dakly/contracts/customers';
import { apiPost } from '@/lib/api-client';

// One file per API call: the request function and its React Query hook.
function createCustomer(input: CreateCustomerInput): Promise<CustomerResponse> {
  return apiPost<CustomerResponse>('/customers', input);
}

export function useCreateCustomer() {
  return useMutation({ mutationFn: createCustomer });
}
