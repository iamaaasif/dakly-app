import { formatCount } from '@dakly/contracts/money';
import type {
  ProductImportDryRun,
  ProductImportDryRunResult,
} from '@dakly/contracts/product-imports';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { downloadErrorReport } from '../product-import-error-report';

const counters: { result: ProductImportDryRunResult; label: string }[] = [
  { result: 'added', label: 'Added' },
  { result: 'changed', label: 'Changed' },
  { result: 'skipped', label: 'Skipped' },
  { result: 'rejected', label: 'Rejected' },
];

export function ProductImportDryRunCounts({ result }: { result: ProductImportDryRun }) {
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {counters.map(({ result: key, label }) => {
        const bad = key === 'rejected' && result.counts.rejected > 0;
        return (
          <div
            key={key}
            className={cn(
              'rounded-lg border p-4',
              bad ? 'border-danger bg-danger-soft text-danger' : 'border-border bg-surface',
            )}
          >
            <dt className="text-sm">{label}</dt>
            <dd className="text-2xl font-bold tabular-nums">{formatCount(result.counts[key])}</dd>
            {bad ? (
              <Button variant="secondary" onClick={() => downloadErrorReport(result.errors)}>
                Download error report
              </Button>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}
