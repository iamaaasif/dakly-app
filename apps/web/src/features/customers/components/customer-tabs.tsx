'use client';
import type { ContactCountsResponse, ContactListQuery } from '@dakly/contracts/contacts';
import { formatCount } from '@dakly/contracts/money';
import { Tabs, TabsList, TabsTrigger, TabCount } from '@dakly/ui/tabs';

import type { CustomerColumn } from '../customer-columns';
import { customerTabs } from '../customer-filter-options';
import { customersHref } from '../customers-query';
import { useUrlRouter } from '@/lib/use-url-query';

const countKeys = {
  all: 'all',
  new: 'new',
  returning: 'returning',
  vip: 'vip',
  inactive: 'inactive',
  high_value: 'highValue',
  at_risk: 'atRisk',
} as const;

type CustomerTabsProps = {
  query: ContactListQuery;
  columns: CustomerColumn[];
  counts: ContactCountsResponse | undefined;
};

export function CustomerTabs({ query, columns, counts }: CustomerTabsProps) {
  const router = useUrlRouter();
  return (
    <Tabs
      value={query.type ?? 'all'}
      onValueChange={(value) =>
        router.push(
          customersHref(query, columns, {
            type: value === 'all' ? undefined : (value as typeof query.type),
          }),
        )
      }
    >
      <TabsList aria-label="Customer types" className="px-4">
        {customerTabs.map((tab) => {
          const value = tab.type ?? 'all';
          return (
            <TabsTrigger key={value} value={value}>
              {tab.label}
              {counts ? <TabCount>{formatCount(counts[countKeys[value]])}</TabCount> : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
