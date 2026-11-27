import { useMutation, useQueryClient } from '@tanstack/react-query';

import { MAX_CONTACT_TAGS, type ContactResponse } from '@dakly/contracts/contacts';

import { customersKeys } from './customers-keys';
import { useStoreRequest } from '@/lib/store-request';

type TaggedContact = { id: string; tags: string[] };

// Each contact keeps its other tags. One that already has the tag, or is full, is left alone.
export function useAddTagToCustomers() {
  const { request } = useStoreRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ contacts, tag }: { contacts: TaggedContact[]; tag: string }) => {
      const changing = contacts.filter(
        (contact) => !contact.tags.includes(tag) && contact.tags.length < MAX_CONTACT_TAGS,
      );
      const results = await Promise.allSettled(
        changing.map((contact) =>
          request<ContactResponse>(`/contacts/${contact.id}`, {
            method: 'PATCH',
            body: { tags: [...contact.tags, tag] },
          }),
        ),
      );
      return { changed: results.filter((result) => result.status === 'fulfilled').length };
    },
    onSettled: () => client.invalidateQueries({ queryKey: customersKeys.all }),
  });
}
