'use client';

import { Megaphone, Plus } from 'lucide-react';
import Link from 'next/link';

import {
  campaignListQuerySchema,
  type CampaignListQuery,
  type CampaignListResponse,
} from '@dakly/contracts/campaigns';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { EmptyState } from '@dakly/ui/empty-state';
import { Skeleton } from '@dakly/ui/skeleton';

import { campaignListHref, useCampaigns } from '../api/campaigns';
import { CampaignFilters } from './campaign-filters';
import { CampaignTable } from './campaign-table';
import { UrlLink } from '@/components/url-link';
import { useSessionContext } from '@/lib/session-context';
import { useUrlQuery } from '@/lib/use-url-query';

export function CampaignsScreen(initial: { query: CampaignListQuery }) {
  const { query } = useUrlQuery(initial, (raw) => {
    const parsed = campaignListQuerySchema.safeParse(raw);
    return parsed.success ? { query: parsed.data } : undefined;
  });
  const { data: session } = useSessionContext();
  const campaigns = useCampaigns(query);
  const canEdit = session?.currentStore?.canEditCampaigns === true;
  const noCampaignsAtAll = hasNoCampaigns(query, campaigns.data);
  return (
    <main className="space-y-6 p-6 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Campaigns</h1>
          <p className="mt-2 text-text-muted">Messages you send to a group of customers.</p>
        </div>
        {canEdit && !noCampaignsAtAll && <CreateCampaignLink />}
      </header>
      {noCampaignsAtAll ? (
        <NoCampaigns canEdit={canEdit} />
      ) : (
        <>
          <CampaignFilters key={session?.contextTag} query={query} />
          <CampaignListState query={query} campaigns={campaigns} />
        </>
      )}
    </main>
  );
}

function NoCampaigns({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <EmptyState
        icon={Megaphone}
        title="You have not sent a campaign yet"
        description="Send an offer or a reminder to a group of customers who agreed to hear from you."
        action={canEdit ? <CreateCampaignLink /> : undefined}
        className="py-24"
      />
    </div>
  );
}

function hasNoCampaigns(query: CampaignListQuery, data: CampaignListResponse | undefined) {
  return data?.items.length === 0 && !query.cursor && !hasFilters(query);
}

function hasFilters({ search, status, channel, createdFrom, createdThrough }: CampaignListQuery) {
  return [search, status, channel, createdFrom, createdThrough].some(Boolean);
}

function CreateCampaignLink() {
  return (
    <Link
      href="/campaigns/new"
      data-shortcut="new"
      className="inline-flex min-h-10 items-center gap-2 rounded-md bg-action px-4 py-2 font-medium text-on-primary hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <Plus aria-hidden="true" size={16} strokeWidth={1.75} /> Create campaign
    </Link>
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
    <section
      className={cn('space-y-4 transition-opacity', campaigns.isPlaceholderData && 'opacity-60')}
      aria-busy={campaigns.isPlaceholderData}
      aria-label="Campaign list"
    >
      {items.length ? (
        <CampaignTable campaigns={items} />
      ) : (
        <div role="status" className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={Megaphone}
            title={query.cursor ? 'This page has no campaigns' : 'No campaigns match'}
            description={
              query.cursor
                ? 'Return to the first page to see current results.'
                : 'Try another name or clear the filters.'
            }
            action={
              query.cursor ? undefined : (
                <UrlLink
                  href={campaignListHref({ limit: query.limit })}
                  className="inline-flex min-h-10 items-center text-action underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  Clear filters
                </UrlLink>
              )
            }
            className="py-16"
          />
        </div>
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
        <UrlLink
          className="min-h-10 text-action underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          href={campaignListHref({ ...query, cursor: undefined })}
        >
          First page
        </UrlLink>
      )}
      {nextCursor && (
        <UrlLink
          className="ml-auto min-h-10 text-action underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          href={campaignListHref({ ...query, cursor: nextCursor })}
        >
          Next page
        </UrlLink>
      )}
    </nav>
  );
}
