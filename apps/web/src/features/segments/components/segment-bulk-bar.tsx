'use client';
import { Archive, ArchiveRestore, X } from 'lucide-react';

import { formatCount } from '@dakly/contracts/money';
import { Button } from '@dakly/ui/button';
import { useToast } from '@dakly/ui/toast';

import { useArchiveSegment } from '../api/archive-segment';

type SegmentBulkBarProps = {
  segmentIds: string[];
  // Restore on the Archive tab; Archive everywhere else.
  archiving: boolean;
  onClear: () => void;
};

export function SegmentBulkBar({ segmentIds, archiving, onClear }: SegmentBulkBarProps) {
  const archive = useArchiveSegment();
  const showToast = useToast();
  const apply = async () => {
    const results = await Promise.allSettled(
      segmentIds.map((segmentId) => archive.mutateAsync({ segmentId, archived: archiving })),
    );
    const failed = results.filter((result) => result.status === 'rejected').length;
    showToast(
      failed
        ? `${formatCount(failed)} could not be ${archiving ? 'archived' : 'restored'}.`
        : `${formatCount(segmentIds.length)} ${archiving ? 'archived' : 'restored'}.`,
    );
    onClear();
  };
  return (
    <div
      role="region"
      aria-label="Selected segments"
      className="flex animate-[motion-fade-in_150ms_ease-out] flex-wrap items-center gap-3 border-b border-border bg-primary-soft px-4 py-2"
    >
      <p className="text-base font-medium tabular-nums">
        {formatCount(segmentIds.length)} selected
      </p>
      <Button
        size="sm"
        variant="secondary"
        loading={archive.isPending}
        onClick={() => void apply()}
      >
        {archiving ? (
          <Archive aria-hidden="true" size={14} />
        ) : (
          <ArchiveRestore aria-hidden="true" size={14} />
        )}
        {archiving ? 'Archive' : 'Restore'}
      </Button>
      <Button size="sm" variant="link" className="ml-auto" onClick={onClear}>
        <X aria-hidden="true" size={14} />
        Clear
      </Button>
    </div>
  );
}
