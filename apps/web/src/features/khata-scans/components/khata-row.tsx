import { Check } from 'lucide-react';

import type { KhataRowResponse } from '@dakly/contracts/khata-scans';
import { cn } from '@dakly/ui/cn';

import {
  confidenceTone,
  readRow,
  rowStatus,
  type RowChoice,
  type RowDraft,
  type RowFieldName,
  type RowReading,
} from '../khata-review';
import { SuggestedCustomer } from './suggested-customer';
import { formatWholeTaka, takaInputFromPoisha } from '@/lib/format-money';

export const rowColumns =
  'grid grid-cols-[132px_minmax(110px,1.2fr)_130px_minmax(90px,1fr)_96px_64px_90px] gap-1.5';

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
  const reading = readRow(row, choice);
  const errors = Object.values(reading.errors);
  return (
    <li
      className={cn(
        'flex flex-col gap-1.5 border-b border-border px-3 py-2.5',
        choice.skipped && 'opacity-50',
      )}
    >
      <RowFields
        row={row}
        choice={choice}
        reading={reading}
        onEdit={(draft) => onChange({ draft })}
      />
      {errors.length > 0 ? (
        <p role="alert" className="text-sm text-danger">
          {errors.join('. ')}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2.5 text-sm">
        <KindNote row={row} reading={reading} />
        {row.match && choice.draft.phone === undefined ? (
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

type RowFieldsProps = Pick<KhataRowProps, 'row' | 'choice'> & {
  reading: RowReading;
  onEdit: (draft: RowDraft) => void;
};

const fieldKinds: Record<
  RowFieldName,
  { name: string; type: string; inputMode?: 'decimal' | 'tel' }
> = {
  entryDate: { name: 'Date', type: 'date' },
  name: { name: 'Customer', type: 'text' },
  phone: { name: 'Phone', type: 'text', inputMode: 'tel' },
  item: { name: 'Product', type: 'text' },
  amount: { name: 'Amount in taka', type: 'text', inputMode: 'decimal' },
};

function RowFields({ row, choice, reading, onEdit }: RowFieldsProps) {
  const status = rowStatus(row, choice);
  const { draft } = choice;
  const isFlagged = (field: RowFieldName) =>
    (row.needsCheck && !choice.checked && draft[field] === undefined) || !!reading.errors[field];
  const input = (field: RowFieldName, shown: string) => (
    <EditableField
      {...fieldKinds[field]}
      label={`${fieldKinds[field].name}, row ${row.rowNumber}`}
      value={draft[field] ?? shown}
      flagged={isFlagged(field)}
      invalid={!!reading.errors[field]}
      onChange={(value) => onEdit({ [field]: value })}
    />
  );
  return (
    <div className={cn(rowColumns, 'items-center')}>
      {input('entryDate', row.entryDate ?? '')}
      {input('name', row.name)}
      {input('phone', row.phone ?? '')}
      {input('item', row.item ?? '')}
      {input('amount', takaInputFromPoisha(row.amountPoisha))}
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

type EditableFieldProps = {
  label: string;
  value: string;
  type: string;
  flagged: boolean;
  invalid: boolean;
  inputMode?: 'decimal' | 'tel';
  onChange: (value: string) => void;
};

function fieldTone(invalid: boolean, flagged: boolean): string {
  if (invalid) return 'border-danger bg-danger-soft';
  return flagged ? 'border-warning bg-warning-soft' : 'border-input-border bg-surface';
}

// A cell you can type in. Yellow marks what Dakly was unsure about; red marks what cannot be imported.
function EditableField({
  label,
  flagged,
  invalid,
  onChange,
  ...input
}: EditableFieldProps & { name?: string }) {
  return (
    <input
      {...input}
      aria-label={label}
      aria-invalid={invalid || undefined}
      max={input.type === 'date' ? new Date().toISOString().slice(0, 10) : undefined}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'h-8 min-w-0 rounded-md border px-1.5 text-base text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        fieldTone(invalid, flagged),
      )}
    />
  );
}

const kindNotes = { sale: 'Paid', payment: 'Payment received', baki: 'Due' };

// An import records what already happened: a sale is paid, a baki is owed.
function KindNote({ row, reading }: { row: KhataRowResponse; reading: RowReading }) {
  const owed = row.kind === 'baki';
  const walkIn = row.kind === 'sale';
  return (
    <>
      <span
        className={cn('font-semibold whitespace-nowrap', owed ? 'text-danger' : 'text-success')}
      >
        {kindNotes[row.kind]}
        {owed ? ` ${formatWholeTaka(BigInt(reading.amountPoisha))}` : ''}
      </span>
      {reading.phone ? null : (
        <span className={walkIn ? 'text-text-muted' : 'text-danger'}>
          {walkIn ? 'No phone · saved as walk-in sale' : 'No phone: link a customer or skip'}
        </span>
      )}
    </>
  );
}
