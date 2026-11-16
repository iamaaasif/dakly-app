'use client';
import { QueryError } from '@dakly/ui/query-error';

import { useSegments } from '../api/segments';
import { SegmentList } from './segment-list';
import { SegmentsLoading } from './segments-loading';

export function SegmentsScreen({ cursor }: { cursor?: string }) {
  const segments = useSegments(cursor);
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
  return <SegmentList page={segments.data} cursor={cursor} />;
}
