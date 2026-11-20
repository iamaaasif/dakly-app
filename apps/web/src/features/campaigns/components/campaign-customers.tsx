'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { campaignOutcomes, type CampaignOutcome } from '@dakly/contracts/campaigns';
import { formatMoney } from '@dakly/contracts/money';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@dakly/ui/tabs';

import { useCampaignCustomers } from '../api/campaign-results';
import { formatDateTime } from '@/lib/format-date';

const outcomeLabels: Record<CampaignOutcome, string> = {
  ordered: 'Ordered',
  tapped: 'Tapped',
  read: 'Read',
  delivered: 'Delivered',
  failed: 'Failed',
  opted_out: 'Opted out',
};

// The tab is in the URL so a link opens the same list.
export function CampaignCustomers({
  campaignId,
  channel,
}: {
  campaignId: string;
  channel: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // An SMS has no read receipt, so it has no Read list.
  const outcomes = campaignOutcomes.filter((outcome) => channel !== 'sms' || outcome !== 'read');
  const requested = useSearchParams().get('outcome');
  const outcome = outcomes.find((item) => item === requested) ?? 'ordered';
  return (
    <section aria-labelledby="customers-heading" className="space-y-3">
      <h2 id="customers-heading" className="text-lg font-semibold">
        Customers
      </h2>
      <Tabs
        value={outcome}
        onValueChange={(next) => router.replace(`${pathname}?outcome=${next}`, { scroll: false })}
      >
        <TabsList aria-label="Outcome">
          {outcomes.map((item) => (
            <TabsTrigger key={item} value={item}>
              {outcomeLabels[item]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <CustomerList campaignId={campaignId} outcome={outcome} />
    </section>
  );
}

function CustomerList({ campaignId, outcome }: { campaignId: string; outcome: CampaignOutcome }) {
  const customers = useCampaignCustomers(campaignId, outcome);
  if (customers.isPending) return <Skeleton className="h-24 w-full" />;
  if (customers.isError)
    return (
      <QueryError
        message={`Could not load the ${outcomeLabels[outcome].toLowerCase()} list.`}
        onRetry={() => void customers.refetch()}
      />
    );
  const items = customers.data.pages.flatMap((page) => page.items);
  if (items.length === 0)
    return <p className="text-text-muted">No one yet in {outcomeLabels[outcome]}.</p>;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {items.map(({ contactId, name, at, orderValuePoisha }) => (
          <li
            key={`${contactId}-${at}`}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3"
          >
            <Link
              href={`/customers/${contactId}`}
              className="font-medium text-action hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {name ?? 'Unnamed customer'}
            </Link>
            <span className="text-sm text-text-muted">
              {orderValuePoisha === null ? '' : `${formatMoney(BigInt(orderValuePoisha))} · `}
              {at ? formatDateTime(at) : ''}
            </span>
          </li>
        ))}
      </ul>
      {customers.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={customers.isFetchingNextPage}
          onClick={() => void customers.fetchNextPage()}
        >
          {customers.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </Button>
      ) : null}
    </div>
  );
}
