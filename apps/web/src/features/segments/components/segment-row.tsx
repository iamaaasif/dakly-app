'use client';
import { Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { SegmentResponse } from '@dakly/contracts/segments';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useRemoveSegment } from '../api/remove-segment';
import { useSegmentCount } from '../api/segment-count';
import { describeRules, matchText } from '../segment-labels';
import { SessionDialog as Dialog } from '@/components/session-dialog';

type SegmentRowProps = {
  segment: SegmentResponse;
  editHref: string;
  canEdit: boolean;
};

export function SegmentRow({ segment, editHref, canEdit }: SegmentRowProps) {
  const [deleting, setDeleting] = useState(false);
  const count = useSegmentCount(segment.rules);
  const countText = count.data ? matchText(count.data.count) : 'Counting…';

  return (
    <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div
          aria-hidden="true"
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-action"
        >
          <Users aria-hidden="true" size={18} />
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold break-words">{segment.name}</h2>
          <p className="text-sm break-words text-text-muted">{describeRules(segment.rules)}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="text-left sm:text-right">
          <p className="text-lg font-bold tabular-nums">
            {count.error ? 'Count not available' : countText}
          </p>
          <p className="text-xs text-text-muted">live count</p>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={editHref}
              aria-label={`Edit ${segment.name}`}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
            >
              Edit
            </Link>
            <Button
              variant="secondary"
              aria-label={`Delete ${segment.name}`}
              onClick={() => setDeleting(true)}
            >
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      {deleting ? (
        <SegmentDeleteDialog segment={segment} onClose={() => setDeleting(false)} />
      ) : null}
    </Card>
  );
}

function SegmentDeleteDialog({
  segment,
  onClose,
}: {
  segment: SegmentResponse;
  onClose: () => void;
}) {
  const remove = useRemoveSegment(segment.id);
  return (
    <Dialog open title={`Delete ${segment.name}?`} onClose={onClose}>
      <p className="mb-4">The customers stay; only this group is removed.</p>
      {remove.error ? (
        <p role="alert" className="mb-4 text-danger">
          {remove.error.message}
        </p>
      ) : null}
      <Button
        variant="danger"
        loading={remove.isPending}
        onClick={() => remove.mutate(undefined, { onSuccess: onClose })}
      >
        Delete segment
      </Button>
    </Dialog>
  );
}
