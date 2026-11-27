'use client';
import { formatCount } from '@dakly/contracts/money';
import { segmentStatuses, type SegmentTabCountsResponse } from '@dakly/contracts/segments';
import { Skeleton } from '@dakly/ui/skeleton';
import { TabCount, Tabs, TabsList, TabsTrigger } from '@dakly/ui/tabs';

import { segmentsHref, type SegmentsView } from '../segments-view';
import { useUrlRouter } from '@/lib/use-url-query';

const tabs = [
  { status: 'all', label: 'All', count: (counts: SegmentTabCountsResponse) => counts.all },
  { status: 'active', label: 'Active', count: (counts: SegmentTabCountsResponse) => counts.active },
  {
    status: 'archived',
    label: 'Archive',
    count: (counts: SegmentTabCountsResponse) => counts.archived,
  },
] as const;

type SegmentTabsProps = { view: SegmentsView; counts: SegmentTabCountsResponse | undefined };

export function SegmentTabs({ view, counts }: SegmentTabsProps) {
  const router = useUrlRouter();
  return (
    <Tabs
      value={view.status}
      onValueChange={(next) => {
        const status = segmentStatuses.find((each) => each === next);
        // A new tab starts from its first page and keeps the search.
        if (status) router.push(segmentsHref({ status, search: view.search }));
      }}
    >
      <TabsList aria-label="Segment status" className="px-2">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.status} value={tab.status}>
            {tab.label}{' '}
            {counts ? (
              <TabCount>{formatCount(tab.count(counts))}</TabCount>
            ) : (
              <Skeleton className="h-5 w-7 rounded-full" />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
