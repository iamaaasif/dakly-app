'use client';
import Link from 'next/link';
import { useState } from 'react';

import type { ContactListQuery } from '@dakly/contracts/contacts';
import { ApiError } from '@dakly/ui/api-client';
import { Badge } from '@dakly/ui/badge';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { customersSearch, useCustomers } from '../api/customers';
import { type CustomerColumn, customerColumnsParam } from '../customer-columns';
import { AddCustomersChooser } from './add-customers-chooser';
import { CustomerFilters } from './customer-filters';
import { CustomerList } from './customer-list';
import { CustomersHeader } from './customers-header';
import { ImportCustomersDialog } from './import-customers-dialog';
import { NewCustomerForm } from './new-customer-form';
import { Refreshing } from '@/components/refreshing';
import { SessionDialog as Dialog } from '@/components/session-dialog';
import { useSessionContext } from '@/lib/session-context';

type CustomersScreenProps = { query: ContactListQuery; columns: CustomerColumn[] };

export function CustomersScreen({ query, columns }: CustomersScreenProps) {
  const [adding, setAdding] = useState<'choose' | 'manual' | 'import' | null>(null);
  const [added, setAdded] = useState(false);
  const customers = useCustomers(query);
  const { data: context } = useSessionContext();
  const canCreate = Boolean(context?.currentStore?.canCreateCustomer);

  const searchError =
    customers.error instanceof ApiError && customers.error.code === 'CONTACT_SEARCH_TOO_SHORT'
      ? customers.error.message
      : undefined;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <CustomersHeader query={query} canCreate={canCreate} onAdd={() => setAdding('choose')} />

      {added ? (
        <p role="status">
          <Badge variant="success">Customer added</Badge>
        </p>
      ) : null}

      <CustomerFilters
        key={`${query.kind}|${query.search}|${query.tag}`}
        query={query}
        columns={columns}
        searchError={searchError}
      />
      <CustomerResults
        query={query}
        columns={columns}
        customers={customers}
        hideError={Boolean(searchError)}
      />

      {adding === 'choose' ? (
        <AddCustomersChooser onChoose={setAdding} onClose={() => setAdding(null)} />
      ) : null}
      {adding === 'manual' ? (
        <Dialog open title="Add customer" onClose={() => setAdding(null)}>
          <NewCustomerForm
            onAdded={() => {
              setAdding(null);
              setAdded(true);
            }}
            onCancel={() => setAdding(null)}
          />
        </Dialog>
      ) : null}
      {adding === 'import' ? <ImportCustomersDialog onClose={() => setAdding(null)} /> : null}
    </main>
  );
}

type CustomerResultsProps = {
  query: ContactListQuery;
  columns: CustomerColumn[];
  customers: ReturnType<typeof useCustomers>;
  hideError: boolean;
};

function CustomerResults({ query, columns, customers, hideError }: CustomerResultsProps) {
  if (customers.error && !hideError)
    return (
      <QueryError
        message={customers.error.message}
        onRetry={() => void customers.refetch()}
        retryLabel="Retry customers"
      />
    );
  if (hideError) return null;
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
    `/customers?${customersSearch({ kind: query.kind, search: query.search, tag: query.tag, columns: customerColumnsParam(columns), cursor })}`;
  return (
    <Refreshing active={customers.isPlaceholderData}>
      <CustomerList customers={items} columns={columns} />
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
    </Refreshing>
  );
}

function emptyMessage(query: ContactListQuery) {
  if (query.search) return 'No customers match. Try a full mobile number or 3 letters of a name.';
  if (query.kind || query.tag) return 'No customers match these filters.';
  return 'No customers yet. Customers you add show here.';
}
