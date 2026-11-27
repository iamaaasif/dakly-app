'use client';
import type { SegmentResponse } from '@dakly/contracts/segments';
import { Button } from '@dakly/ui/button';

import { useRemoveSegment } from '../api/remove-segment';
import { SessionDialog as Dialog } from '@/components/session-dialog';

type DeleteSegmentDialogProps = { segment: SegmentResponse; onClose: () => void };

export function DeleteSegmentDialog({ segment, onClose }: DeleteSegmentDialogProps) {
  const remove = useRemoveSegment(segment.id);
  return (
    <Dialog open title={`Delete ${segment.name}?`} onClose={onClose}>
      <p className="mb-4">
        The customers stay; only this group is removed. To keep it for later, archive it instead.
      </p>
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
