import { type ContactListQuery, contactListQuerySchema } from '@dakly/contracts/contacts';

import { customersSearch } from './api/customers';
import {
  type CustomerColumn,
  customerColumnsParam,
  parseCustomerColumns,
} from './customer-columns';
import type { ListFilterChange } from './customers-query';

const defaultContactSort = 'newest';

// The Contacts page lists everyone, so `hasOrdered` is never set.
export function parseContactsAddress(raw: Record<string, string | undefined>) {
  const { cursor, search, sort, type, source, tag } = raw;
  const parsed = contactListQuerySchema.safeParse({ cursor, search, sort, type, source, tag });
  return parsed.success
    ? { query: parsed.data, columns: parseCustomerColumns(raw.columns) }
    : undefined;
}

export type ContactsScreenState = NonNullable<ReturnType<typeof parseContactsAddress>>;

// A filter change starts from the first page, so the cursor is dropped unless the change names one.
export function contactsHref(
  query: ContactListQuery,
  columns: CustomerColumn[],
  change: ListFilterChange = {},
) {
  const next = { ...query, cursor: undefined, ...change };
  const search = customersSearch({
    search: next.search,
    type: next.type,
    source: next.source,
    tag: next.tag,
    sort: next.sort === defaultContactSort ? undefined : next.sort,
    columns: customerColumnsParam(columns),
    cursor: next.cursor,
  });
  return search ? `/contacts?${search}` : '/contacts';
}

export function hasContactFilters(query: ContactListQuery) {
  return Boolean(query.search || query.type || query.source || query.tag);
}
