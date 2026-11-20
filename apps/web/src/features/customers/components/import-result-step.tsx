import { useState } from 'react';

import type { ImportResponse } from '@dakly/contracts/contacts';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { customersKeys } from '../api/customers-keys';
import { useUndoImport } from '../api/undo-import';
import { ImportOutcome } from '@/components/import-outcome';
import { isImportFinished, useImportProgress } from '@/lib/use-import-progress';

type ImportResultStepProps = { importId: string; onDone: () => void };

export function ImportResultStep({ importId, onDone }: ImportResultStepProps) {
  const progress = useImportProgress(importId, {
    path: '/imports',
    queryKey: (tag) => customersKeys.import(tag, importId),
  });
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
  return (
    <div className="space-y-4">
      <p role="status" className="font-semibold">
        {resultMessage(current)}
      </p>
      <ImportOutcome current={current} />
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
