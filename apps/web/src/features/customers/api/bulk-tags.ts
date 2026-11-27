import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { BulkTagResponse } from '@dakly/contracts/contacts';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

type BulkTagChange = { contactIds: string[]; tag: string };

function useBulkTagRequest(path: '/contacts/bulk-tags' | '/contacts/bulk-tags/remove') {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: BulkTagChange) =>
      request<BulkTagResponse>(path, { method: 'POST', body: change }),
    onSuccess: () => client.invalidateQueries({ queryKey: customersKeys.all }),
  });
}

// Adds to each customer's current tags on the server, so a tag added since the list loaded stays.
export const useAddTagToCustomers = () => useBulkTagRequest('/contacts/bulk-tags');

// Undo of Add tag, sent with only the customers the tag was added to.
export const useRemoveTagFromCustomers = () => useBulkTagRequest('/contacts/bulk-tags/remove');
