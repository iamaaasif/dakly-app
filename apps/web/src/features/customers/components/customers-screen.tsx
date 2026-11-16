'use client';
import Link from 'next/link';

import type { ContactListQuery } from '@dakly/contracts/contacts';
import { ApiError } from '@dakly/ui/api-client';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { customersSearch, useCustomers } from '../api/customers';
import { CustomerFilters } from './customer-filters';
import { CustomerList } from './customer-list';
import { NewCustomerForm } from './new-customer-form';
import { StorePage } from '@/components/store-page';

type CustomersScreenProps = { query: ContactListQuery };

export function CustomersScreen({ query }: CustomersScreenProps) {
  const customers = useCustomers(query);
  const searchError =
    customers.error instanceof ApiError && customers.error.code === 'CONTACT_SEARCH_TOO_SHORT'
      ? customers.error.message
      : undefined;
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <h1 className="text-xl font-bold">All customers</h1>
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <section aria-label="Customer list" className="space-y-4 lg:col-span-2">
          <CustomerFilters
            key={`${query.kind}|${query.search}|${query.tag}`}
            query={query}
            searchError={searchError}
          />
          <CustomerResults query={query} customers={customers} hideError={Boolean(searchError)} />
        </section>
        <StorePage permission="canCreateCustomer">
          <NewCustomerForm />
        </StorePage>
      </div>
    </main>
  );
}

type CustomerResultsProps = {
  query: ContactListQuery;
  customers: ReturnType<typeof useCustomers>;
  hideError: boolean;
};

function CustomerResults({ query, customers, hideError }: CustomerResultsProps) {
  if (customers.error)
    return hideError ? null : (
      <QueryError
        message={customers.error.message}
        onRetry={() => void customers.refetch()}
        retryLabel="Retry customers"
      />
    );
  // Not a status region: the add form's confirmation is the page's only status message.
  if (customers.isPending)
    return (
      <div aria-busy="true" className="space-y-3">
        <p className="sr-only">Loading customers</p>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  const { items, nextCursor } = customers.data;
  if (!items.length) return <p>{emptyMessage(query)}</p>;
  const pageHref = (cursor?: string) =>
    `/customers?${customersSearch({ kind: query.kind, search: query.search, tag: query.tag, cursor })}`;
  return (
    <>
      <CustomerList customers={items} />
      <nav aria-label="Customer pages" className="flex gap-4">
        {query.cursor ? (
          <Link
            className="inline-flex min-h-10 items-center text-action underline"
            href={pageHref()}
          >
            First page
          </Link>
        ) : null}
        {nextCursor ? (
          <Link
            className="inline-flex min-h-10 items-center text-action underline"
            href={pageHref(nextCursor)}
          >
            Next page
          </Link>
        ) : null}
      </nav>
    </>
  );
}

function emptyMessage(query: ContactListQuery) {
  if (query.search) return 'No customers match. Try a full mobile number or 3 letters of a name.';
  if (query.kind || query.tag) return 'No customers match these filters.';
  return 'No customers yet. Customers you add show here.';
}
