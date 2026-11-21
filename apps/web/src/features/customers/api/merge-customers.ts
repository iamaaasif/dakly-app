import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { ContactMergeResponse, MergeContactsInput } from '@dakly/contracts/contacts';

import { customersKeys, matchSuggestionsKeys, mergesKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

// A merge or an undo changes profiles, the open matches and the list of undoable merges.
function refreshAfterMerge(client: QueryClient) {
  return Promise.all(
    [customersKeys.all, matchSuggestionsKeys.all, mergesKeys.all].map((queryKey) =>
      client.invalidateQueries({ queryKey }),
    ),
  );
}

export function useMergeCustomers() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: MergeContactsInput) =>
      request<ContactMergeResponse>('/contact-merges', { method: 'POST', body: input }),
    onSuccess: () => refreshAfterMerge(client),
  });
}

export function useUndoMerge() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (mergeId: string) =>
      request<ContactMergeResponse>(`/contact-merges/${mergeId}/undo`, { method: 'POST' }),
    onSuccess: () => refreshAfterMerge(client),
  });
}
