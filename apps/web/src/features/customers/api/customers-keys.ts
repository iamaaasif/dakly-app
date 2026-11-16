import type { ContactListQuery } from '@dakly/contracts/contacts';

export const customersKeys = {
  all: ['customers'] as const,
  list: (tag: string | undefined, query: ContactListQuery) =>
    ['customers', tag, 'list', query] as const,
  detail: (tag: string | undefined, contactId: string) =>
    ['customers', tag, 'detail', contactId] as const,
};
