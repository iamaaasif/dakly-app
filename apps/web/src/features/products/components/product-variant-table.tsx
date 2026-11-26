'use client';
import { ChevronDown } from 'lucide-react';
import { useState, type ClipboardEvent, type ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';

import type { ProductFormValues, ProductResponse } from '@dakly/contracts/products';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';

import {
  addMissingCombinations,
  cleanPastedNumber,
  groupVariants,
  missingCombinations,
  parsePastedCells,
  pasteColumns,
  rowKey,
  rowStock,
  type EditableField,
  type GridVariant,
  type VariantGroup,
} from '../product-variant-grid';
import { useGridOptions } from './product-option-editor';
import { ProductVariantBulkBar } from './product-variant-bulk-bar';
import { VariantRow, variantGridColumns } from './product-variant-row';

const dirty = { shouldDirty: true } as const;

function typedValue(field: EditableField, value: string): string | number {
  return field === 'initialStock' ? Number(value.replace(/\D/g, '')) || 0 : value;
}

function useKeySet() {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const set = (key: string, on: boolean) =>
    setKeys((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  return { keys, set, replace: (next: string[]) => setKeys(new Set(next)) };
}

function useVariantEdits() {
  const form = useFormContext<ProductFormValues>();
  const [regularPrice, sellPrice] = form.watch(['pricePoisha', 'compareAtPricePoisha']);
  const { options, variants } = useGridOptions();
  const setVariants = (next: GridVariant[]) => form.setValue('variants', next, dirty);
  const setWhere = (
    matches: (variant: GridVariant, index: number) => boolean,
    field: EditableField,
    value: string,
  ) =>
    setVariants(
      variants.map((variant, index) =>
        matches(variant, index) ? { ...variant, [field]: typedValue(field, value) } : variant,
      ),
    );
  // A paste of one value is an ordinary paste; tabs and line breaks fill the cells below and beside.
  const paste = (event: ClipboardEvent<HTMLElement>) => {
    const { gridRow, gridField } = (event.target as HTMLElement).dataset;
    const cells = parsePastedCells(event.clipboardData.getData('text'));
    if (!cells || gridRow === undefined || !gridField) return;
    event.preventDefault();
    const start = pasteColumns.indexOf(gridField as EditableField);
    const next = variants.map((variant) => ({ ...variant }));
    cells.forEach((line, offset) => {
      const target = next[Number(gridRow) + offset];
      line.forEach((cell, column) => {
        const field = pasteColumns[start + column];
        if (target && field)
          Object.assign(target, {
            [field]: typedValue(field, field === 'sku' ? cell : cleanPastedNumber(cell)),
          });
      });
    });
    setVariants(next);
  };
  return {
    options,
    variants,
    setVariants,
    setWhere,
    paste,
    showStock: form.watch('isStockTracked') !== false,
    productPrice: String(sellPrice || regularPrice || ''),
  };
}

type ProductVariantTableProps = { product?: ProductResponse; readOnly?: boolean };

export function ProductVariantTable({ product, readOnly }: ProductVariantTableProps) {
  const edits = useVariantEdits();
  const { options, variants, showStock, setVariants, setWhere } = edits;
  const selected = useKeySet();
  const collapsed = useKeySet();
  const open = useKeySet();
  const isSelected = (variant: GridVariant) => selected.keys.has(rowKey(variant));
  const chosen = variants.filter(isSelected);
  return (
    <div className="space-y-3">
      <ProductVariantBulkBar
        selectedCount={chosen.length}
        showStock={showStock}
        missingCount={missingCombinations(options, variants)}
        removeBlocked={chosen.length >= variants.length}
        onSet={(field, value) => setWhere(isSelected, field, value)}
        onRemove={() => {
          setVariants(variants.filter((variant) => !isSelected(variant)));
          selected.replace([]);
        }}
        onAddMissing={() => setVariants(addMissingCombinations(options, variants))}
      />
      <div className="overflow-hidden rounded-lg border border-border" onPaste={edits.paste}>
        <TableHeader
          allSelected={chosen.length === variants.length && variants.length > 0}
          showStock={showStock}
          onSelectAll={(on) => selected.replace(on ? variants.map(rowKey) : [])}
        />
        {groupVariants(options, variants).map((group) => (
          <GroupSection
            key={group.label}
            group={group}
            showStock={showStock}
            collapsed={collapsed.keys.has(group.label)}
            onToggle={() => collapsed.set(group.label, !collapsed.keys.has(group.label))}
          >
            {group.rows.map(({ variant, index }) => (
              <VariantRow
                key={rowKey(variant)}
                index={index}
                variant={variant}
                options={options}
                productPrice={edits.productPrice}
                productId={product?.id}
                saved={product?.variants.find(({ id }) => id === variant.id)}
                showStock={showStock}
                selected={selected.keys.has(rowKey(variant))}
                open={Boolean(readOnly) || open.keys.has(rowKey(variant))}
                onSelect={(on) => selected.set(rowKey(variant), on)}
                onToggle={() => open.set(rowKey(variant), !open.keys.has(rowKey(variant)))}
                onChange={(field, value) => setWhere((_, at) => at === index, field, value)}
              />
            ))}
          </GroupSection>
        ))}
      </div>
      <Footnote />
    </div>
  );
}

type TableHeaderProps = {
  allSelected: boolean;
  showStock: boolean;
  onSelectAll: (on: boolean) => void;
};

function TableHeader({ allSelected, showStock, onSelectAll }: TableHeaderProps) {
  return (
    <div
      className={cn(
        'hidden bg-surface-muted py-2 text-xs font-medium text-text-muted md:grid md:items-center',
        variantGridColumns,
      )}
    >
      <Checkbox
        aria-label="Select all variants"
        checked={allSelected}
        onCheckedChange={(value) => onSelectAll(value === true)}
      />
      <span>Image</span>
      <span>Variant</span>
      <span>Price</span>
      <span>Cost</span>
      <span>Profit</span>
      <span>{showStock ? 'Stock' : ''}</span>
      <span>Code</span>
    </div>
  );
}

type GroupSectionProps = {
  group: VariantGroup;
  showStock: boolean;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
};

function GroupSection({ group, showStock, collapsed, onToggle, children }: GroupSectionProps) {
  const pieces = group.rows.reduce((total, { variant }) => total + rowStock(variant), 0);
  return (
    <section aria-label={`${group.label} variants`}>
      <button
        type="button"
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 border-t border-border bg-surface-muted px-3 py-2 text-left text-sm"
        onClick={onToggle}
      >
        <ChevronDown aria-hidden="true" className={cn('size-4', collapsed && '-rotate-90')} />
        <span className="font-semibold text-text">{group.label}</span>
        <span className="text-text-muted">
          {group.rows.length} {group.rows.length === 1 ? 'variant' : 'variants'}
          {showStock ? ` · ${pieces} pcs` : ''}
        </span>
      </button>
      {collapsed ? null : <ul>{children}</ul>}
    </section>
  );
}

function Footnote() {
  return (
    <p className="text-xs text-text-muted">
      A blank price uses the product price. Stock edits go to the stock history with one reason
      asked on save.
    </p>
  );
}
