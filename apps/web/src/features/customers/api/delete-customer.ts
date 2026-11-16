import { useMutation, useQueryClient } from '@tanstack/react-query';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useDeleteCustomer(contactId: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request<void>(`/contacts/${contactId}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: customersKeys.all }),
  });
}
