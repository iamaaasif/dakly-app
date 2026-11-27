'use client';
import { Users } from 'lucide-react';
import { useState } from 'react';

import { formatCount } from '@dakly/contracts/money';
import { ApiError } from '@dakly/ui/api-client';
import { EmptyState } from '@dakly/ui/empty-state';
import { PageHeader } from '@dakly/ui/page-header';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';
import { TableCard } from '@dakly/ui/table';

import { useCustomerCounts } from '../api/customer-counts';
import { useCustomers } from '../api/customers';
import {
  type CustomersScreenState,
  customersHref,
  hasCustomerFilters,
  parseCustomersAddress,
} from '../customers-query';
import { CustomerFooter } from './customer-footer';
import { CustomerList } from './customer-list';
import { CustomerTabs } from './customer-tabs';
import { CustomerToolbar } from './customer-toolbar';
import { Refreshing } from '@/components/refreshing';
import { UrlLink } from '@/components/url-link';
import { useUrlQuery } from '@/lib/use-url-query';

export function CustomersScreen(initial: CustomersScreenState) {
  const { query, columns } = useUrlQuery(initial, (raw) => parseCustomersAddress(raw));
  const customers = useCustomers(query);
  const counts = useCustomerCounts();

  const searchError =
    customers.error instanceof ApiError && customers.error.code === 'CONTACT_SEARCH_TOO_SHORT'
      ? customers.error.message
      : undefined;
  const noCustomersAtAll =
    customers.data?.total === 0 && !hasCustomerFilters(query) && !customers.isPlaceholderData;

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <PageHeader
        title="All customers"
        description={
          counts.data
            ? `${formatCount(counts.data.customers)} customers · ${formatCount(counts.data.boughtMoreThanOnce)} bought more than once · ${formatCount(counts.data.canReceiveMarketing)} can receive marketing messages`
            : undefined
        }
      />
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
            <CustomerTabs query={query} columns={columns} counts={counts.data} />
            <CustomerToolbar
              key={`${query.search ?? ''}`}
              query={query}
              columns={columns}
              searchError={searchError}
            />
            {searchError ? null : (
              <CustomerResults
                key={JSON.stringify(query)}
                customers={customers}
                query={query}
                columns={columns}
              />
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

// Keyed by the query so a tab, filter or page change starts with nothing selected.
function CustomerResults({ customers, query, columns }: CustomerResultsProps) {
  const [selected, setSelected] = useState(0);
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
  if (!items.length) return <NoMatches query={query} columns={columns} />;
  return (
    <Refreshing active={customers.isPlaceholderData}>
      <CustomerList customers={items} columns={columns} onSelectionChange={setSelected} />
      <CustomerFooter
        shown={items.length}
        total={total}
        selected={selected}
        firstHref={query.cursor ? customersHref(query, columns) : undefined}
        nextHref={nextCursor ? customersHref(query, columns, { cursor: nextCursor }) : undefined}
      />
    </Refreshing>
  );
}

function NoMatches({ query, columns }: Pick<CustomerResultsProps, 'query' | 'columns'>) {
  const cleared = customersHref(query, columns, {
    type: undefined,
    source: undefined,
    minSpendPoisha: undefined,
    maxSpendPoisha: undefined,
    lastPurchase: undefined,
    search: undefined,
  });
  return (
    <EmptyState
      icon={Users}
      title="No customers match"
      description={
        query.search
          ? 'Try a full mobile number or 3 letters of a name.'
          : 'Try another filter or clear them all.'
      }
      action={
        <UrlLink href={cleared} className="inline-flex min-h-10 items-center text-action underline">
          Clear filters
        </UrlLink>
      }
    />
  );
}
