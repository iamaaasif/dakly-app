'use client';
import { formatCount } from '@dakly/contracts/money';
import { Button } from '@dakly/ui/button';

type CustomerBulkBarProps = { count: number; onClear: () => void };

// Slides up inside the card while rows are ticked. Tag, segment and campaign actions wait for an
// API that takes a list of contacts.
export function CustomerBulkBar({ count, onClear }: CustomerBulkBarProps) {
  return (
    <div
      role="region"
      aria-label="Selected rows"
      className="motion-rise absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-lg bg-inverse px-4 py-2 text-on-primary shadow-overlay"
    >
      <p className="mr-auto text-sm font-medium tabular-nums" aria-live="polite">
        {formatCount(count)} selected
      </p>
      <Button variant="link" onClick={onClear} className="px-3 text-on-primary hover:no-underline">
        Clear
      </Button>
    </div>
  );
}
