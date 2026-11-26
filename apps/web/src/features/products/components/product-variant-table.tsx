'use client';

import { useSearchParams } from 'next/navigation';
import { useRef, useState, type ClipboardEvent } from 'react';
import { useFormContext } from 'react-hook-form';

import type { ProductFormValues, ProductResponse } from '@dakly/contracts/products';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';
import { Label } from '@dakly/ui/label';

import {
  addMissingCombinations,
  cleanPastedNumber,
  groupVariants,
  missingCombinations,
  parsePastedCells,
  pasteColumns,
  rowKey,
  type EditableField,
  type GridOption,
  type GridVariant,
} from '../product-variant-grid';
import { useGridOptions } from './product-option-editor';
import { ProductVariantBulkBar } from './product-variant-bulk-bar';
import { VariantGroupRows, variantTableColumns } from './product-variant-row';
import { ProductVariantSheet } from './product-variant-sheet';
import { useUrlQuery, useUrlRouter } from '@/lib/use-url-query';

const dirty = { shouldDirty: true } as const;

function typedValue(field: EditableField, value: string): string | number {
  if (field === 'initialStock') return Number(value.replace(/\D/g, '')) || 0;
  return field === 'lowStockThreshold' ? value.replace(/\D/g, '') : value;
}

function toggleKey(keys: string[], key: string, include: boolean) {
  return include ? [...new Set([...keys, key])] : keys.filter((value) => value !== key);
}

function useVariantEdits() {
  const form = useFormContext<ProductFormValues>();
  const [regularPrice, sellPrice] = form.watch(['pricePoisha', 'compareAtPricePoisha']);
  const { options, variants } = useGridOptions();
  const setVariants = (next: GridVariant[]) => form.setValue('variants', next, dirty);
  const setWhere = (indexes: number[], field: EditableField, value: string) => {
    const targets = new Set(indexes);
    setVariants(
      variants.map((row, index) =>
        targets.has(index) ? { ...row, [field]: typedValue(field, value) } : row,
      ),
    );
  };
  return {
    options,
    variants,
    setVariants,
    setWhere,
    showStock: form.watch('isStockTracked') !== false,
    productPrice: String(sellPrice || regularPrice || ''),
  };
}

// Spreadsheet rows follow the visible order, which can differ from the saved variant order.
function pasteVariants(
  event: ClipboardEvent<HTMLElement>,
  variants: GridVariant[],
  { visible, showStock }: { visible: number[]; showStock: boolean },
): GridVariant[] | undefined {
  const { gridRow, gridField } = (event.target as HTMLElement).dataset;
  const cells = parsePastedCells(event.clipboardData.getData('text'));
  if (!cells || gridRow === undefined || !gridField) return;
  const rowStart = visible.indexOf(Number(gridRow));
  const columnStart = pasteColumns.indexOf(gridField as EditableField);
  if (rowStart < 0 || columnStart < 0) return;
  event.preventDefault();
  const next = variants.map((variant) => ({ ...variant }));
  cells.forEach((line, offset) => {
    const row = next[visible[rowStart + offset]!];
    line.forEach((cell, column) => {
      const field = pasteColumns[columnStart + column];
      if (row && field && (showStock || field !== 'initialStock'))
        Object.assign(row, {
          [field]: typedValue(field, field === 'sku' ? cell : cleanPastedNumber(cell)),
        });
    });
  });
  return next;
}

function useVariantGrouping(options: GridOption[]) {
  const router = useUrlRouter();
  const address = useSearchParams();
  const requested = useUrlQuery(address?.get('groupBy') ?? '', (raw) => raw.groupBy ?? '');
  const position = Math.max(
    0,
    options.findIndex(({ name }) => name === requested),
  );
  return {
    position,
    select: (name: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set('groupBy', name);
      router.push(url.pathname + url.search + url.hash);
    },
  };
}

function useTableRows(options: GridOption[], variants: GridVariant[], position: number) {
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const groups = groupVariants(options, variants, position);
  const key = (label: string) => JSON.stringify([options[position]?.name, label]);
  const isCollapsed = (label: string) => collapsed.includes(key(label));
  const chosen = variants.flatMap((row, index) => (selected.includes(rowKey(row)) ? [index] : []));
  const visible = groups.flatMap(({ label, rows }) =>
    isCollapsed(label) ? [] : rows.map(({ index }) => index),
  );
  return {
    groups,
    chosen,
    visible,
    selected,
    isCollapsed,
    onToggle: (label: string) =>
      setCollapsed(toggleKey(collapsed, key(label), !isCollapsed(label))),
    onSelect: (row: string, checked: boolean) => setSelected(toggleKey(selected, row, checked)),
    onSelectAll: (checked: boolean) => setSelected(checked ? variants.map(rowKey) : []),
  };
}

type ProductVariantTableProps = { product?: ProductResponse; readOnly?: boolean };

export function ProductVariantTable({ product, readOnly }: ProductVariantTableProps) {
  const edits = useVariantEdits();
  const { options, variants, showStock, productPrice, setVariants, setWhere } = edits;
  const grouping = useVariantGrouping(options);
  const rows = useTableRows(options, variants, grouping.position);
  const [editing, setEditing] = useState<string | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const editIndex = variants.findIndex((row) => rowKey(row) === editing);
  const variant = variants[editIndex];
  const savedById = new Map(product?.variants.map((item) => [item.id, item]));
  const paste = (event: ClipboardEvent<HTMLElement>) => {
    if (readOnly) return;
    const next = pasteVariants(event, variants, { visible: rows.visible, showStock });
    if (next) setVariants(next);
  };
  return (
    <div className="space-y-3" onPaste={paste}>
      <GroupingControl options={options} {...grouping} />
      <VariantTableGroups
        {...{ edits, rows, savedById, readOnly }}
        onEdit={(key, button) => {
          openButton.current = button;
          setEditing(key);
        }}
      />
      {variant && (
        <ProductVariantSheet
          {...{ options, variant, product, productPrice, showStock, readOnly }}
          index={editIndex}
          saved={savedById.get(variant.id ?? '')}
          onClose={() => setEditing(null)}
          restoreFocusTo={() => openButton.current}
          onChange={(field, value) => setWhere([editIndex], field, value)}
        />
      )}
      {!readOnly && (
        <p className="text-xs text-text-muted">
          A blank price uses the product price. Stock edits go to the stock history with one reason
          asked on save.
        </p>
      )}
    </div>
  );
}

function GroupingControl({
  options,
  position,
  select,
}: {
  options: GridOption[];
  position: number;
  select: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-text">Variants</h3>
      <Label className="flex items-center gap-2">
        Show by
        <select
          className="min-h-10 max-w-40 rounded-md border border-input-border bg-surface px-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          value={options[position]?.name ?? ''}
          onChange={(event) => select(event.target.value)}
        >
          {options.map(({ name }) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </Label>
    </div>
  );
}

type VariantTableGroupsProps = {
  edits: ReturnType<typeof useVariantEdits>;
  rows: ReturnType<typeof useTableRows>;
  savedById: Map<string, ProductResponse['variants'][number]>;
  readOnly?: boolean;
  onEdit: (key: string, button: HTMLButtonElement) => void;
};

function VariantTableGroups({ edits, rows, savedById, readOnly, onEdit }: VariantTableGroupsProps) {
  const { options, variants, showStock, productPrice, setWhere, setVariants } = edits;
  const { chosen, selected } = rows;
  const shared = { options, savedById, productPrice, showStock, readOnly, selected, onEdit };
  const allSelected = chosen.length === variants.length && variants.length > 0;
  return (
    <>
      {!readOnly && (
        <ProductVariantBulkBar
          selectedCount={chosen.length}
          showStock={showStock}
          missingCount={missingCombinations(options, variants)}
          removeBlocked={allSelected}
          onSet={(field, value) => setWhere(chosen, field, value)}
          onRemove={() => {
            setVariants(variants.filter((_, index) => !chosen.includes(index)));
            rows.onSelectAll(false);
          }}
          onAddMissing={() => setVariants(addMissingCombinations(options, variants))}
        />
      )}
      <div className="@container rounded-lg border border-border">
        <TableHeader
          checked={allSelected}
          {...{ readOnly, showStock }}
          onSelectAll={rows.onSelectAll}
        />
        {rows.groups.map((group) => (
          <VariantGroupRows
            key={group.label}
            {...shared}
            group={group}
            collapsed={rows.isCollapsed(group.label)}
            onToggle={() => rows.onToggle(group.label)}
            onSelect={rows.onSelect}
            onChange={setWhere}
          />
        ))}
        {!rows.groups.length && <p className="p-3 text-sm text-text-muted">No variants yet.</p>}
      </div>
    </>
  );
}

type TableHeaderProps = {
  checked: boolean;
  readOnly?: boolean;
  showStock: boolean;
  onSelectAll: (checked: boolean) => void;
};

function TableHeader({ checked, readOnly, showStock, onSelectAll }: TableHeaderProps) {
  return (
    <div
      className={cn(
        'grid items-center rounded-t-lg bg-surface-muted px-2 py-2 text-xs font-medium text-text-muted',
        variantTableColumns,
      )}
    >
      {readOnly ? (
        <span />
      ) : (
        <Checkbox
          aria-label="Select all variants"
          checked={checked}
          onCheckedChange={(next) => onSelectAll(next === true)}
        />
      )}
      <span>
        <span className="sr-only @lg:not-sr-only">Image</span>
      </span>
      <span>Variant</span>
      <span className="hidden @lg:block">Price</span>
      <span className="hidden @lg:block">Cost</span>
      <span className="hidden @lg:block">{showStock ? 'Available' : 'Stock'}</span>
      <span>
        <span className="sr-only">{readOnly ? 'View' : 'Edit'}</span>
      </span>
    </div>
  );
}
