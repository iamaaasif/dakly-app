import { useMutation, useQueryClient } from '@tanstack/react-query';

import { matchSuggestionsKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useDismissMatchSuggestion() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (suggestionId: string) =>
      request<void>(`/contact-match-suggestions/${suggestionId}/dismiss`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: matchSuggestionsKeys.all }),
  });
}
