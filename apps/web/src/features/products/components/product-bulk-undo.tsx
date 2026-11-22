'use client';
import { useState } from 'react';

import { Button } from '@dakly/ui/button';

import { useUndoProductBulkEdit, useUndoableBulkEdits } from '../api/product-bulk-edits';
import { formatDateTime } from '@/lib/format-date';

export function ProductBulkUndo() {
  const edits = useUndoableBulkEdits();
  const undo = useUndoProductBulkEdit();
  const [result, setResult] = useState<string | null>(null);
  const latest = edits.data?.items[0];
  if (result)
    return (
      <p role="status" className="rounded-lg bg-success-soft px-4 py-3 text-sm text-success">
        {result}
      </p>
    );
  if (!latest) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg bg-success-soft px-4 py-3 text-sm"
    >
      <p className="text-text">
        Changed {latest.changedValues} {latest.changedValues === 1 ? 'value' : 'values'} on{' '}
        {latest.changedProducts} {latest.changedProducts === 1 ? 'product' : 'products'}. You can
        undo until {formatDateTime(latest.undoUntil)}.
      </p>
      <Button
        variant="secondary"
        disabled={undo.isPending}
        onClick={() =>
          undo.mutate(latest.id, {
            onSuccess: ({ restored, skipped }) =>
              setResult(
                skipped
                  ? `Undone: ${restored} restored, ${skipped} left as they are because they changed since.`
                  : `Undone: ${restored} restored.`,
              ),
          })
        }
      >
        Undo
      </Button>
      {undo.error ? (
        <p role="alert" className="text-danger">
          {undo.error.message}
        </p>
      ) : null}
    </div>
  );
}
