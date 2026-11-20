import { useQuery } from '@tanstack/react-query';

import type { MatchSuggestionResponse } from '@dakly/contracts/contacts';

import { matchSuggestionsKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

export function useMatchSuggestions(contactId: string) {
  const { request, contextTag } = useStoreRequest();
  return useQuery({
    queryKey: matchSuggestionsKeys.forContact(contextTag, contactId),
    queryFn: ({ signal }) =>
      request<MatchSuggestionResponse[]>(`/contact-match-suggestions?contactId=${contactId}`, {
        signal,
      }),
    enabled: Boolean(contextTag),
    retry: false,
  });
}
