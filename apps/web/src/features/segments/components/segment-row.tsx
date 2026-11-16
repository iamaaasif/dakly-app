'use client';
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
};

export function SegmentRow({ segment }: SegmentRowProps) {
  const [deleting, setDeleting] = useState(false);
  const count = useSegmentCount(segment.rules);
  const remove = useRemoveSegment(segment.id);
  const countText = count.data ? matchText(count.data.count) : 'Counting…';
  return (
    <Card className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-1">
        <h2 className="text-md font-semibold break-words">{segment.name}</h2>
        <p className="text-sm break-words text-text-muted">{describeRules(segment.rules)}</p>
        <p className="tabular-nums">{count.error ? 'Count not available' : countText}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="secondary"
          aria-label={`Delete ${segment.name}`}
          onClick={() => setDeleting(true)}
        >
          Delete
        </Button>
      </div>
      {deleting ? (
        <Dialog open title={`Delete ${segment.name}?`} onClose={() => setDeleting(false)}>
          <p className="mb-4">The customers stay; only this group is removed.</p>
          {remove.error ? (
            <p role="alert" className="mb-4 text-danger">
              {remove.error.message}
            </p>
          ) : null}
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: () => setDeleting(false) })}
          >
            Delete segment
          </Button>
        </Dialog>
      ) : null}
    </Card>
  );
}
