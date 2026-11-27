'use client';
import { ChevronUp } from 'lucide-react';
import { useState } from 'react';

import { formatMoney } from '@dakly/contracts/money';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';

import { OrderCard } from '../new-order-fields';
import type { NewOrderTotals } from '../new-order-totals';

type Row = { label: string; value: number; strong?: boolean };

export function rowsOf(input: {
  totals: NewOrderTotals;
  deliveryPoisha: number;
  discountPoisha: number;
  advancePoisha: number;
}): Row[] {
  const { totals, deliveryPoisha, discountPoisha, advancePoisha } = input;
  return [
    { label: 'Subtotal', value: totals.subtotalPoisha },
    { label: 'Delivery charge', value: deliveryPoisha },
    { label: 'Discount', value: totals.discountTooLarge ? 0 : discountPoisha },
    { label: 'Total', value: totals.totalPoisha, strong: true },
    { label: 'Advance paid', value: advancePoisha },
  ];
}

function OrderSummaryRows({ rows }: { rows: Row[] }) {
  return (
    <dl className="space-y-2 text-base tabular-nums">
      {rows.map(({ label, value, strong }) => (
        <div
          key={label}
          className={cn('flex justify-between gap-3', strong && 'border-t border-border pt-3')}
        >
          <dt className={cn(!strong && 'text-text-secondary', strong && 'font-semibold')}>
            {label}
          </dt>
          <dd className={cn(strong && 'font-bold')}>{formatMoney(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

// One mounted live region, so a screen reader hears the new amount and typing never replays an animation.
function CashToCollect({ poisha }: { poisha: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border pt-4">
      <span className="text-base text-text-secondary">Cash to collect</span>
      <strong aria-live="polite" className="text-xl font-bold tabular-nums">
        {formatMoney(poisha)}
      </strong>
    </div>
  );
}

type OrderSummaryCardProps = {
  rows: Row[];
  cashToCollectPoisha: number;
  warning?: string;
};

export function OrderSummaryCard({ rows, cashToCollectPoisha, warning }: OrderSummaryCardProps) {
  return (
    <OrderCard title="Summary" className="lg:sticky lg:top-20">
      <OrderSummaryRows rows={rows} />
      <CashToCollect poisha={cashToCollectPoisha} />
      {warning && (
        <p role="alert" className="text-sm text-danger">
          {warning}
        </p>
      )}
      <p className="text-sm text-text-muted">
        A preview. The server recalculates every catalogue price when you save.
      </p>
    </OrderCard>
  );
}

type OrderSummaryBarProps = OrderSummaryCardProps & { creating: boolean; onCreate: () => void };

// On a phone the summary is a bar above the bottom edge. Tapping it opens every row.
export function OrderSummaryBar({
  rows,
  cashToCollectPoisha,
  warning,
  creating,
  onCreate,
}: OrderSummaryBarProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface px-4 py-3 shadow-overlay lg:hidden">
      {open && (
        <div className="motion-popover mb-3 space-y-3" data-state="open">
          <OrderSummaryRows rows={rows} />
          {warning && (
            <p role="alert" className="text-sm text-danger">
              {warning}
            </p>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <span className="min-w-0">
            <span className="block text-sm text-text-muted">Cash to collect</span>
            <strong className="block text-md tabular-nums">
              {formatMoney(cashToCollectPoisha)}
            </strong>
          </span>
          <ChevronUp
            aria-hidden="true"
            size={16}
            className={cn('shrink-0 text-text-muted transition-transform', open && 'rotate-180')}
          />
        </button>
        <Button loading={creating} onClick={onCreate} className="min-h-11 px-6">
          Create
        </Button>
      </div>
    </div>
  );
}
