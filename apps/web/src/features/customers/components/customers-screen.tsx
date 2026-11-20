'use client';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { ContactListQuery } from '@dakly/contracts/contacts';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { customersSearch, useCustomers } from '../api/customers';
import { CustomerFilters } from './customer-filters';
import { CustomerList } from './customer-list';
import { NewCustomerForm } from './new-customer-form';
import { SessionDialog as Dialog } from '@/components/session-dialog';
import { useSessionContext } from '@/lib/session-context';

type CustomersScreenProps = { query: ContactListQuery };

export function CustomersScreen({ query }: CustomersScreenProps) {
  const [adding, setAdding] = useState(false);
  const customers = useCustomers(query);
  const { data: context } = useSessionContext();
  const canCreate = Boolean(context?.currentStore?.canCreateCustomer);

  const searchError =
    customers.error instanceof ApiError && customers.error.code === 'CONTACT_SEARCH_TOO_SHORT'
      ? customers.error.message
      : undefined;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">All customers</h1>
        </div>
        {canCreate ? (
          <div className="flex items-center gap-2">
            <Button onClick={() => setAdding(true)} className="gap-2">
              <Plus aria-hidden="true" size={16} strokeWidth={1.75} /> Add customers
            </Button>
          </div>
        ) : null}
      </div>

      <CustomerFilters
        key={`${query.kind}|${query.search}|${query.tag}`}
        query={query}
        searchError={searchError}
      />
      <CustomerResults query={query} customers={customers} hideError={Boolean(searchError)} />

      {adding ? (
        <Dialog open title="Add customer" onClose={() => setAdding(false)}>
          <NewCustomerForm onDone={() => setAdding(false)} />
        </Dialog>
      ) : null}
    </main>
  );
}

type CustomerResultsProps = {
  query: ContactListQuery;
  customers: ReturnType<typeof useCustomers>;
  hideError: boolean;
};

function CustomerResults({ query, customers, hideError }: CustomerResultsProps) {
  if (customers.error && !hideError)
    return (
      <QueryError
        message={customers.error.message}
        onRetry={() => void customers.refetch()}
        retryLabel="Retry customers"
      />
    );
  if (customers.isPending || !customers.data)
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
