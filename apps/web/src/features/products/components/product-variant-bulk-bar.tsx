'use client';
import { useState, type ComponentProps } from 'react';

import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

import type { EditableField } from '../product-variant-grid';

const bulkFields: { field: EditableField; label: string }[] = [
  { field: 'priceOverridePoisha', label: 'Set price' },
  { field: 'costPoisha', label: 'Set cost' },
  { field: 'initialStock', label: 'Set stock' },
];

type ProductVariantBulkBarProps = {
  selectedCount: number;
  showStock: boolean;
  missingCount: number;
  removeBlocked: boolean;
  onSet: (field: EditableField, value: string) => void;
  onRemove: () => void;
  onAddMissing: () => void;
};

export function ProductVariantBulkBar(props: ProductVariantBulkBarProps) {
  const { selectedCount, showStock, missingCount, removeBlocked } = props;
  const [editing, setEditing] = useState<BulkField | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-muted p-3 text-sm">
      <span className="font-medium text-text">
        {selectedCount ? `${selectedCount} selected` : 'None selected'}
      </span>
      {selectedCount && editing ? (
        <BulkEditor
          editing={editing}
          count={selectedCount}
          onApply={(value) => props.onSet(editing.field, value)}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {selectedCount && !editing ? (
        <>
          {bulkFields
            .filter(({ field }) => showStock || field !== 'initialStock')
            .map((bulk) => (
              <SmallButton key={bulk.field} onClick={() => setEditing(bulk)}>
                {bulk.label}
              </SmallButton>
            ))}
          <SmallButton
            disabled={removeBlocked}
            title={removeBlocked ? 'A product with options keeps at least one row' : undefined}
            onClick={props.onRemove}
          >
            Remove
          </SmallButton>
        </>
      ) : null}
      {missingCount ? (
        <SmallButton onClick={props.onAddMissing}>
          Add missing combinations ({missingCount})
        </SmallButton>
      ) : null}
      <span className="text-text-muted">Paste from a spreadsheet to fill the grid.</span>
    </div>
  );
}

type BulkField = { field: EditableField; label: string };

type BulkEditorProps = {
  editing: BulkField;
  count: number;
  onApply: (value: string) => void;
  onClose: () => void;
};

function BulkEditor({ editing, count, onApply, onClose }: BulkEditorProps) {
  const [value, setValue] = useState('');
  const apply = () => {
    onApply(value.trim());
    onClose();
  };
  return (
    <>
      <Input
        aria-label={editing.label}
        inputMode="decimal"
        autoFocus
        value={value}
        className="h-8 min-h-8 w-28 py-1"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          apply();
        }}
      />
      <Button type="button" className="h-8 px-2.5 text-xs" onClick={apply}>
        Apply to {count}
      </Button>
      <SmallButton onClick={onClose}>Cancel</SmallButton>
    </>
  );
}

function SmallButton({ children, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button type="button" variant="secondary" className="h-8 px-2.5 text-xs" {...props}>
      {children}
    </Button>
  );
}
