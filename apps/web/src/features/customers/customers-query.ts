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
  const { cursor, type, source, minSpendPoisha, maxSpendPoisha, lastPurchase, search, sort } = raw;
  const parsed = contactListQuerySchema.safeParse({
    cursor,
    type,
    source,
    minSpendPoisha,
    maxSpendPoisha,
    lastPurchase,
    search,
    sort: sort ?? defaultCustomerSort,
    hasOrdered: 'true',
  });
  return parsed.success
    ? { query: parsed.data, columns: parseCustomerColumns(raw.columns) }
    : undefined;
}

export type CustomersScreenState = NonNullable<ReturnType<typeof parseCustomersAddress>>;

export type CustomerFilterChange = Partial<
  Pick<
    ContactListQuery,
    | 'type'
    | 'source'
    | 'minSpendPoisha'
    | 'maxSpendPoisha'
    | 'lastPurchase'
    | 'search'
    | 'sort'
    | 'cursor'
  >
>;

// A filter change starts from the first page, so the cursor is dropped unless the change names one.
export function customersHref(
  query: ContactListQuery,
  columns: CustomerColumn[],
  change: CustomerFilterChange = {},
) {
  const next = { ...query, cursor: undefined, ...change };
  const search = customersSearch({
    type: next.type,
    source: next.source,
    minSpendPoisha: next.minSpendPoisha,
    maxSpendPoisha: next.maxSpendPoisha,
    lastPurchase: next.lastPurchase,
    search: next.search,
    sort: next.sort === defaultCustomerSort ? undefined : next.sort,
    columns: customerColumnsParam(columns),
    cursor: next.cursor,
  });
  return search ? `/customers?${search}` : '/customers';
}

export function hasCustomerFilters(query: ContactListQuery) {
  return Boolean(
    query.type ||
    query.source ||
    query.minSpendPoisha !== undefined ||
    query.maxSpendPoisha !== undefined ||
    query.lastPurchase ||
    query.search,
  );
}
