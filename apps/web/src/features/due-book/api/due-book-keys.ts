import type { DueListFilter } from '@dakly/contracts/due-book';

export const dueBookKeys = {
  all: ['due-book'] as const,
  summary: (tag: string | undefined) => ['due-book', tag, 'summary'] as const,
  list: (tag: string | undefined, filter: DueListFilter) =>
    ['due-book', tag, 'list', filter] as const,
  history: (tag: string | undefined, contactId: string) =>
    ['due-book', tag, 'history', contactId] as const,
};
