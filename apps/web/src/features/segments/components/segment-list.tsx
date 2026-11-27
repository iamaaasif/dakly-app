'use client';
import { BookUser, Plus, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatCount } from '@dakly/contracts/money';
import type { SegmentTabCountsResponse } from '@dakly/contracts/segments';
import { buttonVariants } from '@dakly/ui/button';
import { PageHeader } from '@dakly/ui/page-header';
import { QueryError } from '@dakly/ui/query-error';
import { TableCard, TableFooter, TableToolbar } from '@dakly/ui/table';

import { type useSegments } from '../api/segments';
import { segmentsPageSize, segmentsHref, type SegmentsView } from '../segments-view';
import { SegmentSearch } from './segment-search';
import { SegmentTable } from './segment-table';
import { SegmentTabs } from './segment-tabs';
import { SegmentRowsLoading } from './segments-loading';
import { Refreshing } from '@/components/refreshing';
import { UrlLink } from '@/components/url-link';
import { pluralize } from '@/lib/pluralize';
import { useUrlRouter } from '@/lib/use-url-query';

type SegmentListProps = {
  view: SegmentsView;
  segments: ReturnType<typeof useSegments>;
  counts: SegmentTabCountsResponse | undefined;
  canEdit: boolean;
};

const addHref = '/segments?edit=new';

export function SegmentList({ view, segments, counts, canEdit }: SegmentListProps) {
  const hasNone = counts?.all === 0 && !view.search;
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="All segments"
        description={`${counts ? pluralize(counts.all, 'segment') : 'Segments'} · Groups of customers that update every day.`}
        actions={canEdit ? <AddSegment /> : null}
      />
      {hasNone ? (
        <TableCard>
          <NoSegments canEdit={canEdit} />
        </TableCard>
      ) : (
        <SegmentCard view={view} segments={segments} counts={counts} canEdit={canEdit} />
      )}
    </main>
  );
}

function AddSegment() {
  return (
    <Link href={addHref} className={buttonVariants()}>
      <Plus aria-hidden="true" size={16} strokeWidth={2} />
      Add Segment
    </Link>
  );
}

function SegmentCard({ view, segments, counts, canEdit }: SegmentListProps) {
  return (
    <TableCard>
      <SegmentTabs view={view} counts={counts} />
      <TableToolbar className="p-4">
        <SegmentSearch view={view} />
      </TableToolbar>
      <SegmentResults view={view} segments={segments} counts={counts} canEdit={canEdit} />
    </TableCard>
  );
}

// The server pages by cursor, so the page number comes from the pages this visit has seen.
function usePageTrail(view: SegmentsView) {
  const router = useUrlRouter();
  const [trail, setTrail] = useState<(string | undefined)[]>(
    view.cursor ? [undefined, view.cursor] : [undefined],
  );
  const index = Math.max(trail.indexOf(view.cursor), 0);
  const go = (cursor: string | undefined) => router.push(segmentsHref({ ...view, cursor }));
  return {
    page: index + 1,
    next: (cursor: string) => {
      setTrail([...trail.slice(0, index + 1), cursor]);
      go(cursor);
    },
    previous: () => go(trail[index - 1]),
  };
}

function SegmentResults({ view, segments, counts, canEdit }: SegmentListProps) {
  const trail = usePageTrail(view);
  if (segments.isPending) return <SegmentRowsLoading />;
  if (segments.error)
    return (
      <QueryError
        message={segments.error.message}
        onRetry={() => void segments.refetch()}
        retryLabel="Retry segments"
      />
    );
  const { items, nextCursor } = segments.data;
  const total = counts
    ? counts[view.status === 'archived' ? 'archived' : view.status]
    : items.length;
  const pageCount = nextCursor
    ? Math.max(Math.ceil(total / segmentsPageSize), trail.page + 1)
    : trail.page;
  return (
    <Refreshing active={segments.isPlaceholderData}>
      {items.length ? (
        <SegmentTable segments={items} view={view} canEdit={canEdit} />
      ) : (
        <NoMatches view={view} />
      )}
      <TableFooter
        summary={`Showing ${formatCount(items.length)} of ${formatCount(total)}`}
        page={trail.page}
        pageCount={pageCount}
        onPrevious={trail.previous}
        onNext={() => nextCursor && trail.next(nextCursor)}
      />
    </Refreshing>
  );
}

function NoSegments({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
      <span
        aria-hidden="true"
        className="mb-2 grid size-20 place-items-center rounded-lg bg-neutral-soft text-text-muted"
      >
        <BookUser size={40} strokeWidth={1.5} />
      </span>
      <h2 className="text-md font-semibold">You don&rsquo;t have any segment yet</h2>
      <p className="text-sm text-text-muted">Once you create segments they will be visible here.</p>
      {canEdit ? (
        <div className="pt-3">
          <AddSegment />
        </div>
      ) : null}
    </div>
  );
}

function NoMatches({ view }: { view: SegmentsView }) {
  let message = 'No segments on this page';
  if (view.status === 'archived') message = 'No archived segments';
  if (view.search) message = `No segments match “${view.search}”`;
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <SearchX aria-hidden="true" size={32} strokeWidth={1.25} className="text-text-subtle" />
      <p className="font-semibold text-text">{message}</p>
      {view.search ? (
        <UrlLink
          href={segmentsHref({ status: view.status })}
          className="inline-flex min-h-10 items-center text-sm font-medium text-action underline"
        >
          Clear search
        </UrlLink>
      ) : null}
    </div>
  );
}
