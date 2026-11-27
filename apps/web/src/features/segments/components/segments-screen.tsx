'use client';
import Link from 'next/link';

import { QueryError } from '@dakly/ui/query-error';

import { useSegments, useSegmentTabCounts } from '../api/segments';
import { listHref, parseSegmentsView, type SegmentsView } from '../segments-view';
import { SegmentBuilder } from './segment-builder';
import { SegmentList } from './segment-list';
import { SegmentsLoading } from './segments-loading';
import { useUrlQuery } from '@/lib/use-url-query';

type SegmentsScreenProps = { view: SegmentsView; canEdit: boolean };

export function SegmentsScreen({ view: initial, canEdit }: SegmentsScreenProps) {
  const view = useUrlQuery(initial, parseSegmentsView);
  const segments = useSegments(view);
  const counts = useSegmentTabCounts();
  // A member who cannot edit segments can open one to read it, but not to change it.
  const editing = canEdit ? view.edit : undefined;
  const openId = editing ?? view.view ?? view.edit;
  if (editing === 'new')
    return (
      <main className="mx-auto max-w-7xl p-4 md:p-8">
        <SegmentBuilder listHref={listHref(view)} />
      </main>
    );
  if (segments.isPending) return <SegmentsLoading />;
  if (!openId)
    return <SegmentList view={view} segments={segments} counts={counts.data} canEdit={canEdit} />;
  return (
    <main className="mx-auto max-w-7xl p-4 md:p-8">
      <OpenSegment
        segments={segments}
        openId={openId}
        view={view}
        canEdit={canEdit}
        readOnly={!editing}
      />
    </main>
  );
}

type OpenSegmentProps = {
  segments: ReturnType<typeof useSegments>;
  openId: string;
  view: SegmentsView;
  canEdit: boolean;
  readOnly: boolean;
};

function OpenSegment({ segments, openId, view, canEdit, readOnly }: OpenSegmentProps) {
  if (segments.error)
    return (
      <QueryError
        message={segments.error.message}
        onRetry={() => void segments.refetch()}
        retryLabel="Retry segments"
      />
    );
  // There is no single-segment route, so the segment comes from the list page it was opened on.
  const opened = segments.data?.items.find((segment) => segment.id === openId);
  if (!opened)
    return (
      <p role="alert">
        This segment was deleted or is on another page.{' '}
        <Link href="/segments" className="text-action underline">
          Open the segment list
        </Link>
        .
      </p>
    );
  return (
    <SegmentBuilder
      key={`${opened.id}|${readOnly ? 'view' : 'edit'}`}
      segment={opened}
      listHref={listHref(view)}
      canEdit={canEdit}
      readOnly={readOnly}
    />
  );
}
