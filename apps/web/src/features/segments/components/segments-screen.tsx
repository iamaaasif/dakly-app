'use client';
import Link from 'next/link';

import { QueryError } from '@dakly/ui/query-error';

import { useSegments } from '../api/segments';
import { SegmentBuilder } from './segment-builder';
import { SegmentList } from './segment-list';
import { SegmentsLoading } from './segments-loading';

type SegmentsScreenProps = {
  cursor?: string;
  edit?: string;
};

export function SegmentsScreen({ cursor, edit }: SegmentsScreenProps) {
  const listHref = cursor ? `/segments?cursor=${encodeURIComponent(cursor)}` : '/segments';
  const segments = useSegments(cursor);
  if (edit === 'new')
    return (
      <main className="p-4 md:p-8">
        <SegmentBuilder listHref={listHref} />
      </main>
    );
  if (segments.isPending) return <SegmentsLoading />;
  if (segments.error)
    return (
      <main className="p-4 md:p-8">
        <QueryError
          message={segments.error.message}
          onRetry={() => void segments.refetch()}
          retryLabel="Retry segments"
        />
      </main>
    );
  if (!edit) return <SegmentList page={segments.data} cursor={cursor} />;
  // There is no single-segment route, so the segment comes from the list page it was opened on.
  const editing = segments.data.items.find((segment) => segment.id === edit);
  return (
    <main className="p-4 md:p-8">
      {editing ? (
        <SegmentBuilder key={editing.id} segment={editing} listHref={listHref} />
      ) : (
        <p role="alert">
          This segment was deleted or is on another page.{' '}
          <Link href="/segments" className="text-action underline">
            Open the segment list
          </Link>
          .
        </p>
      )}
    </main>
  );
}
