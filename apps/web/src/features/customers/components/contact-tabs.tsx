'use client';
import {
  type ContactCountsResponse,
  type ContactListQuery,
  contactListTypes,
} from '@dakly/contracts/contacts';
import { formatCount } from '@dakly/contracts/money';
import { TabCount, Tabs, TabsList, TabsTrigger } from '@dakly/ui/tabs';

import type { CustomerColumn } from '../customer-columns';
import { customerTypeLabels } from '../customer-labels';
import type { ListHref } from '../customers-query';
import { useUrlRouter } from '@/lib/use-url-query';

type Tab = { value: string; label: string; count: keyof ContactCountsResponse };

const countKeys = { high_value: 'highValue', at_risk: 'atRisk' } as const;

const tabs: Tab[] = [
  { value: 'all', label: 'All', count: 'all' },
  ...contactListTypes.map((type) => ({
    value: type,
    label: customerTypeLabels[type],
    count: type === 'high_value' || type === 'at_risk' ? countKeys[type] : type,
  })),
];

type ContactTabsProps = {
  query: ContactListQuery;
  columns: CustomerColumn[];
  counts: ContactCountsResponse | undefined;
  hrefFor: ListHref;
};

export function ContactTabs({ query, columns, counts, hrefFor }: ContactTabsProps) {
  const router = useUrlRouter();
  return (
    <Tabs
      value={query.type ?? 'all'}
      onValueChange={(value) =>
        router.push(
          hrefFor(columns, {
            type: value === 'all' ? undefined : (value as typeof query.type),
          }),
        )
      }
    >
      <TabsList aria-label="Contact types" className="px-4">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
            {counts ? <TabCount>{formatCount(counts[tab.count])}</TabCount> : null}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
