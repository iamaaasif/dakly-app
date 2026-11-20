import { useState } from 'react';

import type { ImportResponse } from '@dakly/contracts/contacts';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { isImportFinished, useImportProgress } from '../api/import-progress';
import { useUndoImport } from '../api/undo-import';

type ImportResultStepProps = { importId: string; onDone: () => void };

export function ImportResultStep({ importId, onDone }: ImportResultStepProps) {
  const progress = useImportProgress(importId);
  if (progress.error && !progress.data)
    return (
      <QueryError
        message={progress.error.message}
        onRetry={() => void progress.refetch()}
        retryLabel="Retry import status"
      />
    );
  const current = progress.data;
  if (!current || !isImportFinished(current.status))
    return (
      <p role="status" aria-busy="true">
        Importing customers. Keep this window open to see the result.
      </p>
    );
  return <ImportResult current={current} importId={importId} onDone={onDone} />;
}

type ImportResultProps = { current: ImportResponse; importId: string; onDone: () => void };

function ImportResult({ current, importId, onDone }: ImportResultProps) {
  const undone = current.status === 'undone';
  const counts = [
    ['Added', current.rowsAdded],
    ['Updated', current.rowsUpdated],
    ['Skipped', current.rowsSkipped],
    ['Failed', current.rowsFailed],
  ] as const;
  return (
    <div className="space-y-4">
      <p role="status" className="font-semibold">
        {resultMessage(current)}
      </p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map(([label, count]) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-3">
            <dt className="text-sm text-text-muted">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{count ?? 0}</dd>
          </div>
        ))}
      </dl>
      {current.reportUrl ? (
        <a href={current.reportUrl} className="inline-block text-action underline">
          Download the error report
        </a>
      ) : null}
      <ImportActions importId={importId} undone={undone} onDone={onDone} />
    </div>
  );
}

function resultMessage(current: ImportResponse) {
  if (current.status === 'undone')
    return current.undoFinishedAt ? 'Import undone.' : 'Undoing the import.';
  if (current.status === 'failed')
    return 'The import stopped. Customers saved before it stopped are kept.';
  return 'Import finished.';
}

type ImportActionsProps = { importId: string; undone: boolean; onDone: () => void };

function ImportActions({ importId, undone, onDone }: ImportActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const undo = useUndoImport(importId);
  const asking = confirming && !undone;
  return (
    <>
      {undo.error ? (
        <p role="alert" className="text-danger">
          {undo.error.message}
        </p>
      ) : null}
      {asking ? (
        <p className="text-sm text-text-muted">
          This removes the customers this file added and clears the consent it recorded. Customers
          who already existed stay.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        {asking ? (
          <Button
            variant="secondary"
            disabled={undo.isPending}
            onClick={() => setConfirming(false)}
          >
            Keep the import
          </Button>
        ) : null}
        {undone ? null : (
          <Button
            variant={asking ? 'danger' : 'secondary'}
            loading={undo.isPending}
            onClick={() => (asking ? undo.mutate() : setConfirming(true))}
          >
            {asking ? 'Yes, undo the import' : 'Undo import'}
          </Button>
        )}
        {asking ? null : <Button onClick={onDone}>Done</Button>}
      </div>
    </>
  );
}
