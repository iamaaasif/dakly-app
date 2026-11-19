'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';

import type { CampaignListQuery } from '@dakly/contracts/campaigns';
import { Button } from '@dakly/ui/button';
import { Skeleton } from '@dakly/ui/skeleton';

import { campaignListHref, useCampaigns } from '../api/campaigns';
import { CampaignFilters } from './campaign-filters';
import { CampaignTable } from './campaign-table';
import { useSessionContext } from '@/lib/session-context';

export function CampaignsScreen({ query }: { query: CampaignListQuery }) {
  const { data: session } = useSessionContext();
  const campaigns = useCampaigns(query);
  return (
    <main className="space-y-6 p-6 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Campaigns</h1>
          <p className="mt-2 text-text-muted">Messages you send to a group of customers.</p>
        </div>
        {session?.currentStore?.canEditCampaigns && (
          <Link
            href="/campaigns/new"
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-action px-4 py-2 font-medium text-on-primary hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Plus aria-hidden="true" size={16} strokeWidth={1.75} /> Create campaign
          </Link>
        )}
      </header>
      <CampaignFilters key={`${session?.contextTag ?? ''}/${query.search ?? ''}`} query={query} />
      <CampaignListState query={query} campaigns={campaigns} />
    </main>
  );
}

function CampaignListState({
  query,
  campaigns,
}: {
  query: CampaignListQuery;
  campaigns: ReturnType<typeof useCampaigns>;
}) {
  if (campaigns.isPending)
    return (
      <div role="status">
        <span className="sr-only">Loading campaigns</span>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (campaigns.isError)
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <p>{campaigns.error.message}</p>
        <Button variant="secondary" onClick={() => void campaigns.refetch()}>
          Try again
        </Button>
      </div>
    );
  const { items, nextCursor } = campaigns.data;
  return (
    <section className="space-y-4" aria-label="Campaign list">
      {items.length ? (
        <CampaignTable campaigns={items} />
      ) : (
        <p role="status" className="rounded-lg border border-border bg-surface p-4">
          {query.cursor
            ? 'This page has no campaigns. Return to the first page to see current results.'
            : 'No campaigns match these filters.'}
        </p>
      )}
      {(query.cursor || nextCursor) && <CampaignPages query={query} nextCursor={nextCursor} />}
    </section>
  );
}

function CampaignPages({
  query,
  nextCursor,
}: {
  query: CampaignListQuery;
  nextCursor: string | null;
}) {
  return (
    <nav aria-label="Campaign pages" className="flex justify-between gap-4">
      {query.cursor && (
        <Link
          className="min-h-10 text-action underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          href={campaignListHref({ ...query, cursor: undefined })}
        >
          First page
        </Link>
      )}
      {nextCursor && (
        <Link
          className="ml-auto min-h-10 text-action underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          href={campaignListHref({ ...query, cursor: nextCursor })}
        >
          Next page
        </Link>
      )}
    </nav>
  );
}
