import { useQuery } from '@tanstack/react-query';

import type { ContactResponse } from '@dakly/contracts/contacts';

import { useSessionContext } from '@/lib/session-context';
import { useStoreRequest } from '@/lib/store-request';

// Staff without customer access still see the chat; the panel then shows only the name.
export function useChatContact(contactId: string) {
  const { request, contextTag } = useStoreRequest();
  const { data } = useSessionContext();
  return useQuery({
    queryKey: ['chats', contextTag, 'contact', contactId],
    queryFn: ({ signal }) => request<ContactResponse>(`/contacts/${contactId}`, { signal }),
    enabled: Boolean(contextTag && data?.currentStore?.canViewCustomers),
    retry: false,
  });
}
