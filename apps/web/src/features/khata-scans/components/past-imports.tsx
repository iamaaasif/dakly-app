import { FileText } from 'lucide-react';
import { useState } from 'react';

import type { KhataImportResponse } from '@dakly/contracts/khata-scans';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { Skeleton } from '@dakly/ui/skeleton';

import { useUndoKhataImport } from '../api/import-khata-page';
import { useKhataImports } from '../api/khata-imports';
import { SessionDialog } from '@/components/session-dialog';
import { formatDhakaMonthDay } from '@/lib/format-date';

export function PastImports() {
  const [undoing, setUndoing] = useState<KhataImportResponse>();
  return (
    <section
      aria-labelledby="past-imports"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h2 id="past-imports" className="font-semibold">
        Past imports
      </h2>
      <ImportList onUndo={setUndoing} />
      {undoing ? <UndoDialog item={undoing} onClose={() => setUndoing(undefined)} /> : null}
    </section>
  );
}

function ImportList({ onUndo }: { onUndo: (item: KhataImportResponse) => void }) {
  const imports = useKhataImports();
  if (imports.isPending) return <Skeleton className="mt-3 h-12 w-full" />;
  if (imports.isError)
    return <QueryError message={imports.error.message} onRetry={() => void imports.refetch()} />;
  if (imports.data.length === 0)
    return <p className="mt-2 text-text-muted">Nothing imported yet.</p>;
  return (
    <ul>
      {imports.data.map((item) => (
        <li
          key={item.id}
          className="mt-2 flex flex-wrap items-center gap-3 border-t border-border pt-2"
        >
          <FileText aria-hidden="true" size={16} strokeWidth={1.75} className="text-text-muted" />
          <span className="min-w-44 flex-1">
            <span className="block font-semibold">
              {formatDhakaMonthDay(item.createdAt)} · 1 page · Notebook photos
            </span>
            <span className="block text-sm text-text-muted">
              {item.rowsImported} of {item.rowsRead} rows imported · {item.customersCreated} new
              customers
            </span>
          </span>
          <UndoControl item={item} onUndo={() => onUndo(item)} />
        </li>
      ))}
    </ul>
  );
}

function UndoControl({ item, onUndo }: { item: KhataImportResponse; onUndo: () => void }) {
  if (item.status === 'undone') return <span className="text-sm text-text-muted">Undone</span>;
  if (Date.parse(item.undoUntil) < Date.now()) return null;
  return (
    <Button variant="secondary" onClick={onUndo}>
      Undo
    </Button>
  );
}

function UndoDialog({ item, onClose }: { item: KhataImportResponse; onClose: () => void }) {
  const undo = useUndoKhataImport();
  return (
    <SessionDialog open title="Undo this import?" onClose={onClose} closeDisabled={undo.isPending}>
      <p className="mb-4 text-text-muted">
        This removes the customers, sales and baki it added, unless someone changed them since. The
        page goes back to review, so you can import it again.
      </p>
      {undo.isError ? (
        <p role="alert" className="mb-4 text-danger">
          {undo.error.message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={undo.isPending}>
          Keep it
        </Button>
        <Button
          variant="danger"
          loading={undo.isPending}
          onClick={() => undo.mutate(item.id, { onSuccess: onClose })}
        >
          Undo import
        </Button>
      </div>
    </SessionDialog>
  );
}
