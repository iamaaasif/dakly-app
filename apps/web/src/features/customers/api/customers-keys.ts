import type { ContactListQuery } from '@dakly/contracts/contacts';

export const customersKeys = {
  all: ['customers'] as const,
  list: (tag: string | undefined, query: ContactListQuery) =>
    ['customers', tag, 'list', query] as const,
  counts: (tag: string | undefined) => ['customers', tag, 'counts'] as const,
  detail: (tag: string | undefined, contactId: string) =>
    ['customers', tag, 'detail', contactId] as const,
  profile: (tag: string | undefined, contactId: string, part: string) =>
    ['customers', tag, 'profile', contactId, part] as const,
  import: (tag: string | undefined, importId: string) =>
    ['customers', tag, 'import', importId] as const,
};

export const matchSuggestionsKeys = {
  all: ['contact-match-suggestions'] as const,
  forContact: (tag: string | undefined, contactId: string) =>
    ['contact-match-suggestions', tag, contactId] as const,
};

export const mergesKeys = {
  all: ['contact-merges'] as const,
  forContact: (tag: string | undefined, contactId: string) =>
    ['contact-merges', tag, contactId] as const,
};
