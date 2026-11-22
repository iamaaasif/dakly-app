'use client';
import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';

import type { ProductFormValues, ProductResponse } from '@dakly/contracts/products';
import { cn } from '@dakly/ui/cn';

import {
  groupVariants,
  rowKey,
  rowStock,
  type EditableField,
  type GridVariant,
  type VariantGroup,
} from '../product-variant-grid';
import { useGridOptions } from './product-option-editor';
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
  return {
    options,
    variants,
    setWhere,
    showStock: form.watch('isStockTracked') !== false,
    productPrice: String(form.watch('pricePoisha') ?? ''),
  };
}

type ProductVariantTableProps = { product?: ProductResponse };

export function ProductVariantTable({ product }: ProductVariantTableProps) {
  const { options, variants, showStock, setWhere, productPrice } = useVariantEdits();
  const collapsed = useKeySet();
  const open = useKeySet();
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <TableHeader showStock={showStock} />
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
                productPrice={productPrice}
                productId={product?.id}
                saved={product?.variants.find(({ id }) => id === variant.id)}
                showStock={showStock}
                open={open.keys.has(rowKey(variant))}
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

function TableHeader({ showStock }: { showStock: boolean }) {
  return (
    <div
      className={cn(
        'hidden bg-surface-muted py-2 text-xs font-medium text-text-muted md:grid md:items-center',
        variantGridColumns,
      )}
    >
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
