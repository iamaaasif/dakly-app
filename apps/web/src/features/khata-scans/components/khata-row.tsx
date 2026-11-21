import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import type { KhataRowResponse } from '@dakly/contracts/khata-scans';
import { cn } from '@dakly/ui/cn';

import { confidenceTone, rowStatus, type RowChoice } from '../khata-review';
import { SuggestedCustomer } from './suggested-customer';
import { formatMonthDay } from '@/lib/format-date';
import { formatWholeTaka } from '@/lib/format-money';
import { formatPhone } from '@/lib/format-phone';

export const rowColumns =
  'grid grid-cols-[86px_minmax(110px,1.2fr)_120px_minmax(90px,1fr)_86px_70px_150px] gap-1.5';

const toneClasses = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};
const statusClasses = {
  success: 'text-success',
  warning: 'text-warning',
  muted: 'text-text-muted',
};
const actionButton =
  'inline-flex min-h-7 items-center gap-1 rounded-md border bg-surface px-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

export type KhataRowProps = {
  row: KhataRowResponse;
  choice: RowChoice;
  onChange: (change: Partial<RowChoice>) => void;
};

export function KhataRow({ row, choice, onChange }: KhataRowProps) {
  return (
    <li
      className={cn(
        'flex flex-col gap-1.5 border-b border-border px-3 py-2.5',
        choice.skipped && 'opacity-50',
      )}
    >
      <RowFields row={row} choice={choice} />
      <div className="flex flex-wrap items-center gap-2.5 text-sm">
        <KindNote row={row} />
        {row.match ? (
          <SuggestedCustomer
            match={row.match}
            choice={choice}
            onLink={(link) => onChange({ link })}
          />
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onChange({ checked: !choice.checked })}
          aria-pressed={choice.checked}
          className={cn(actionButton, 'border-success text-success')}
        >
          <Check aria-hidden="true" size={14} strokeWidth={1.75} />
          Looks right
        </button>
        <button
          type="button"
          onClick={() => onChange({ skipped: !choice.skipped })}
          className={cn(actionButton, 'border-border-strong')}
        >
          {choice.skipped ? 'Include' : 'Skip'}
        </button>
      </div>
    </li>
  );
}

function RowFields({ row, choice }: Pick<KhataRowProps, 'row' | 'choice'>) {
  const flagged = row.needsCheck && !choice.checked;
  const status = rowStatus(row, choice);
  return (
    <div className={cn(rowColumns, 'items-center')}>
      <Field>{row.entryDate ? formatMonthDay(row.entryDate) : ''}</Field>
      <Field flagged={flagged}>{row.name}</Field>
      <Field flagged={flagged}>{row.phone ? formatPhone(row.phone) : ''}</Field>
      <Field>{row.item ?? ''}</Field>
      <Field flagged={flagged}>{formatWholeTaka(BigInt(row.amountPoisha))}</Field>
      <span
        className={cn(
          'justify-self-start rounded-full px-2 py-0.5 text-xs font-bold',
          toneClasses[confidenceTone(row.confidence)],
        )}
      >
        {row.confidence}%
      </span>
      <span className={cn('font-semibold', statusClasses[status.tone])}>{status.label}</span>
    </div>
  );
}

function Field({ children, flagged = false }: { children: ReactNode; flagged?: boolean }) {
  return (
    <span
      className={cn(
        'h-8 truncate rounded-md border px-1.5 leading-8',
        flagged ? 'border-warning bg-warning-soft' : 'border-border bg-surface',
      )}
    >
      {children}
    </span>
  );
}

const kindNotes = {
  sale: { text: () => 'Paid', className: 'text-success' },
  payment: { text: () => 'Payment received', className: 'text-success' },
  baki: {
    text: (row: KhataRowResponse) => `Due ${formatWholeTaka(BigInt(row.amountPoisha))}`,
    className: 'text-danger',
  },
};

// An import records what already happened: a sale is paid, a baki is owed.
function KindNote({ row }: { row: KhataRowResponse }) {
  const note = kindNotes[row.kind];
  return (
    <>
      <span className={cn('font-semibold whitespace-nowrap', note.className)}>
        {note.text(row)}
      </span>
      {row.phone ? null : <NoPhoneNote kind={row.kind} />}
    </>
  );
}

function NoPhoneNote({ kind }: { kind: KhataRowResponse['kind'] }) {
  return kind === 'sale' ? (
    <span className="text-text-muted">No phone · saved as walk-in sale</span>
  ) : (
    <span className="text-danger">No phone: link a customer or skip</span>
  );
}
