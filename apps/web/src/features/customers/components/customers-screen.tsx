'use client';
import { Users } from 'lucide-react';

import { ApiError } from '@dakly/ui/api-client';
import { EmptyState } from '@dakly/ui/empty-state';
import { PageHeader } from '@dakly/ui/page-header';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';
import { TableCard } from '@dakly/ui/table';

import { useCustomers } from '../api/customers';
import {
  type CustomersScreenState,
  customersHref,
  hasCustomerFilters,
  parseCustomersAddress,
} from '../customers-query';
import { CustomerFooter } from './customer-footer';
import { CustomerList } from './customer-list';
import { CustomerToolbar } from './customer-toolbar';
import { Refreshing } from '@/components/refreshing';
import { useUrlQuery } from '@/lib/use-url-query';

export function CustomersScreen(initial: CustomersScreenState) {
  const { query, columns } = useUrlQuery(initial, (raw) => parseCustomersAddress(raw));
  const customers = useCustomers(query);

  const searchError =
    customers.error instanceof ApiError && customers.error.code === 'CONTACT_SEARCH_TOO_SHORT'
      ? customers.error.message
      : undefined;
  const noCustomersAtAll =
    customers.data?.total === 0 && !hasCustomerFilters(query) && !customers.isPlaceholderData;

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <PageHeader title="All customers" />
      <TableCard className="motion-enter">
        {noCustomersAtAll ? (
          <EmptyState
            icon={Users}
            title="You don't have any customer yet"
            description="A person shows here after their first order."
            className="py-24"
          />
        ) : (
          <>
            <CustomerToolbar
              key={`${query.search ?? ''}`}
              query={query}
              columns={columns}
              searchError={searchError}
            />
            {searchError ? null : (
              <CustomerResults customers={customers} query={query} columns={columns} />
            )}
          </>
        )}
      </TableCard>
    </main>
  );
}

type CustomerResultsProps = {
  customers: ReturnType<typeof useCustomers>;
  query: CustomersScreenState['query'];
  columns: CustomersScreenState['columns'];
};

function CustomerResults({ customers, query, columns }: CustomerResultsProps) {
  if (customers.error)
    return (
      <div className="p-4">
        <QueryError
          message={customers.error.message}
          onRetry={() => void customers.refetch()}
          retryLabel="Retry customers"
        />
      </div>
    );
  if (customers.isPending || !customers.data)
    return (
      <div aria-busy="true" className="space-y-3 p-4">
        <p className="sr-only">Loading customers</p>
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    );
  const { items, nextCursor, total } = customers.data;
  if (!items.length) return <NoMatches query={query} />;
  return (
    <Refreshing active={customers.isPlaceholderData}>
      <CustomerList customers={items} columns={columns} />
      <CustomerFooter
        shown={items.length}
        total={total}
        noun="customers"
        firstHref={query.cursor ? customersHref(query, columns) : undefined}
        nextHref={nextCursor ? customersHref(query, columns, { cursor: nextCursor }) : undefined}
      />
    </Refreshing>
  );
}

function NoMatches({ query }: Pick<CustomerResultsProps, 'query'>) {
  return (
    <EmptyState
      icon={Users}
      title="No customers match"
      description={query.search ? 'Try a full mobile number or 3 letters of a name.' : undefined}
    />
  );
}
