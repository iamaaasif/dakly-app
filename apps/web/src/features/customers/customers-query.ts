import { type ContactListQuery, contactListQuerySchema } from '@dakly/contracts/contacts';

import { customersSearch } from './api/customers';
import {
  type CustomerColumn,
  customerColumnsParam,
  parseCustomerColumns,
} from './customer-columns';

const defaultCustomerSort = 'last_purchase';

// The Customers page lists only people who ordered, so `hasOrdered` is set here and never in the address.
export function parseCustomersAddress(raw: Record<string, string | undefined>) {
  const { cursor, search, sort } = raw;
  const parsed = contactListQuerySchema.safeParse({
    cursor,
    search,
    sort: sort ?? defaultCustomerSort,
    hasOrdered: 'true',
  });
  return parsed.success
    ? { query: parsed.data, columns: parseCustomerColumns(raw.columns) }
    : undefined;
}

export type CustomersScreenState = NonNullable<ReturnType<typeof parseCustomersAddress>>;

export type ListFilterChange = Partial<
  Pick<ContactListQuery, 'search' | 'sort' | 'cursor' | 'type' | 'source' | 'tag'>
>;

// A filter change starts from the first page, so the cursor is dropped unless the change names one.
export function customersHref(
  query: ContactListQuery,
  columns: CustomerColumn[],
  change: ListFilterChange = {},
) {
  const next = { ...query, cursor: undefined, ...change };
  const search = customersSearch({
    search: next.search,
    sort: next.sort === defaultCustomerSort ? undefined : next.sort,
    columns: customerColumnsParam(columns),
    cursor: next.cursor,
  });
  return search ? `/customers?${search}` : '/customers';
}

export type ListHref = (columns: CustomerColumn[], change: ListFilterChange) => string;

export function hasCustomerFilters(query: ContactListQuery) {
  return Boolean(query.search);
}
