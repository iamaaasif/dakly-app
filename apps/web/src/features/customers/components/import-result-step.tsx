import type { ImportResponse } from '@dakly/contracts/contacts';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { isImportFinished, useImportProgress } from '../api/import-progress';

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
  return <ImportResult current={current} onDone={onDone} />;
}

type ImportResultProps = { current: ImportResponse; onDone: () => void };

function ImportResult({ current, onDone }: ImportResultProps) {
  const counts = [
    ['Added', current.rowsAdded],
    ['Updated', current.rowsUpdated],
    ['Skipped', current.rowsSkipped],
    ['Failed', current.rowsFailed],
  ] as const;
  return (
    <div className="space-y-4">
      <p role="status" className="font-semibold">
        {current.status === 'failed'
          ? 'The import stopped. Customers saved before it stopped are kept.'
          : 'Import finished.'}
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
      <div className="flex justify-end pt-2">
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
