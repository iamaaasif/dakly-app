import { Check } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@dakly/ui/button';

import type { PageImport } from './khata-review-page';

type DoneStepProps = { imports: PageImport[]; onScanMore: () => void };

export function KhataDoneStep({ imports, onScanMore }: DoneStepProps) {
  const sum = (pick: (item: PageImport) => number) =>
    imports.reduce((total, item) => total + pick(item), 0);
  const results = [
    ['Rows found', sum((item) => item.result.rowsRead)],
    ['Imported', sum((item) => item.result.rowsImported)],
    ['New customers', sum((item) => item.result.customersCreated)],
    ['Matched to existing customers', sum((item) => item.matched)],
    ['Walk-in sales (no phone)', sum((item) => item.walkIn)],
    ['Skipped', sum((item) => item.result.rowsSkipped)],
  ] as const;
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-lg bg-success-soft text-success">
          <Check aria-hidden="true" size={22} strokeWidth={1.75} />
        </span>
        <div>
          <h2 className="text-lg font-bold">Your khata is now in Dakly</h2>
          <p className="text-text-muted">
            Sales were added to customer profiles and Sales history. You can undo this for 7 days.
          </p>
        </div>
      </div>
      <dl className="grid gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        {results.map(([label, count]) => (
          <div key={label} className="rounded-lg bg-surface-muted p-3">
            <dd className="text-lg font-bold">{count}</dd>
            <dt className="text-text-muted">{label}</dt>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/orders"
          className="inline-flex min-h-10 items-center rounded-md bg-action px-4 font-medium text-on-primary hover:bg-action-hover"
        >
          See imported sales
        </Link>
        <Link
          href="/customers"
          className="inline-flex min-h-10 items-center rounded-md border border-input-border bg-surface px-4 font-medium hover:bg-surface-muted"
        >
          View customers
        </Link>
        <Button variant="secondary" onClick={onScanMore}>
          Scan more pages
        </Button>
      </div>
    </section>
  );
}
