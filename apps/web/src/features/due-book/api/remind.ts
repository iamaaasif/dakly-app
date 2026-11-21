import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { RemindOverdueResponse, RemindResponse } from '@dakly/contracts/due-book';

import { dueBookKeys } from './due-book-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useRemindCustomer(contactId: string) {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<RemindResponse>(`/due-book/customers/${contactId}/reminders`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: dueBookKeys.all }),
  });
}

export function useRemindOverdue() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<RemindOverdueResponse>('/due-book/reminders/overdue', { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: dueBookKeys.all }),
  });
}
