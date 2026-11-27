'use client';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { formatMoney } from '@dakly/contracts/money';
import { cn } from '@dakly/ui/cn';

import { OrderCard } from '../new-order-fields';
import type { OrderLine } from '../new-order-lines';
import { Thumbnail } from './order-product-results';
import { OrderProductSearch } from './order-product-search';
import { takaInputFromPoisha } from '@/lib/format-money';

type OrderLinesCardProps = {
  lines: OrderLine[];
  notice: string | undefined;
  error: string | undefined;
  onAdd: (line: OrderLine) => void;
  onQuantity: (variantId: string, quantity: number) => void;
  onRemove: (line: OrderLine, index: number) => void;
};

export function OrderLinesCard({
  lines,
  notice,
  error,
  onAdd,
  onQuantity,
  onRemove,
}: OrderLinesCardProps) {
  return (
    <OrderCard title="Products">
      {lines.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {lines.map((line, index) => (
            <OrderLineRow
              key={line.variantId}
              line={line}
              onQuantity={(quantity) => onQuantity(line.variantId, quantity)}
              onRemove={() => onRemove(line, index)}
            />
          ))}
        </ul>
      )}
      <OrderProductSearch onPick={onAdd} />
      {notice && (
        <p role="status" className="text-sm text-warning">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </OrderCard>
  );
}

function OrderLineRow({
  line,
  onQuantity,
  onRemove,
}: {
  line: OrderLine;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const atLimit = line.available !== null && line.quantity >= line.available;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-3 py-3 sm:flex-nowrap">
      <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
        <Thumbnail url={line.photoUrl} size={48} />
        <div className="min-w-0">
          <p className="truncate font-medium text-text">{line.productName}</p>
          <p className="text-sm text-text-muted">
            {line.variantTitle || (line.available === null ? 'No variants' : '')}
            {line.available !== null && (
              <span className={cn(atLimit && 'text-warning')}>
                {line.variantTitle ? ' · ' : ''}
                {line.available} in stock
              </span>
            )}
          </p>
        </div>
      </div>
      <p
        className="flex min-h-10 items-center gap-2 rounded-md border border-input-border bg-surface-muted px-3 tabular-nums"
        title="The catalogue price. The server checks it again when you save."
      >
        <span aria-hidden="true" className="text-text-muted">
          BDT
        </span>
        <span className="text-text">{takaInputFromPoisha(line.unitPricePoisha)}</span>
        <span className="sr-only">{formatMoney(line.unitPricePoisha)} each</span>
      </p>
      <QuantityStepper line={line} onChange={onQuantity} />
      <button
        type="button"
        aria-label={`Remove ${line.productName} ${line.variantTitle}`.trim()}
        onClick={onRemove}
        className="ml-auto inline-flex size-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Trash2 aria-hidden="true" size={18} strokeWidth={1.75} />
      </button>
    </li>
  );
}

function QuantityStepper({
  line,
  onChange,
}: {
  line: OrderLine;
  onChange: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState(String(line.quantity));
  useEffect(() => setDraft(String(line.quantity)), [line.quantity]);
  const step =
    'inline-flex size-10 items-center justify-center text-text-muted hover:bg-surface-hover disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';
  return (
    <div className="flex items-center rounded-md border border-input-border bg-surface">
      <button
        type="button"
        aria-label="One less"
        disabled={line.quantity <= 1}
        onClick={() => onChange(line.quantity - 1)}
        className={cn(step, 'rounded-l-md')}
      >
        <Minus aria-hidden="true" size={16} strokeWidth={1.75} />
      </button>
      <input
        inputMode="numeric"
        aria-label={`Quantity of ${line.productName} ${line.variantTitle}`.trim()}
        value={draft}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '');
          setDraft(digits);
          if (digits) onChange(Number(digits));
        }}
        onBlur={() => setDraft(String(line.quantity))}
        className="h-10 w-12 border-x border-input-border bg-transparent text-center tabular-nums focus-visible:outline-2 focus-visible:outline-focus"
      />
      <button
        type="button"
        aria-label="One more"
        disabled={line.available !== null && line.quantity >= line.available}
        onClick={() => onChange(line.quantity + 1)}
        className={cn(step, 'rounded-r-md')}
      >
        <Plus aria-hidden="true" size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
