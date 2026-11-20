import type { ImportResponse } from '@dakly/contracts/contacts';

type ImportOutcomeProps = { current: ImportResponse };

export function ImportOutcome({ current }: ImportOutcomeProps) {
  const counts = [
    ['Added', current.rowsAdded],
    ['Updated', current.rowsUpdated],
    ['Skipped', current.rowsSkipped],
    ['Failed', current.rowsFailed],
  ] as const;
  return (
    <>
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
    </>
  );
}
