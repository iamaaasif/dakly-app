'use client';
import { Trash2 } from 'lucide-react';
import { useFormContext, type UseFormReturn } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Input } from '@dakly/ui/input';

const PRESETS = [
  { label: 'S, M, L, XL', sizes: ['S', 'M', 'L', 'XL'] },
  { label: 'M, L, XL', sizes: ['M', 'L', 'XL'] },
  { label: 'One size', sizes: ['One size'] },
] as const;

type ProductSizesProps = {
  onStockChange: (index: number, quantity: number) => void;
  onAddOption: () => void;
};

export function ProductSizes({ onStockChange, onAddOption }: ProductSizesProps) {
  const form = useFormContext<ProductFormValues>();
  const options = form.watch('options') ?? [];
  const variants = form.watch('variants') ?? [];
  const sizes = options[0]?.name.toLowerCase() === 'size' ? options[0].values : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text">Sizes and stock</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applySizesPreset(form, p.sizes)}
              className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-text-muted transition-colors hover:border-primary hover:text-primary"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {sizes.map((size, index) => {
        const val = variants[index]?.initialStock;
        const stock = typeof val === 'number' ? val : 0;
        return (
          <ProductSizeRow
            key={index}
            index={index}
            size={size}
            stock={stock}
            onUpdate={(i, name) => updateSizeName(form, i, name)}
            onStockChange={(i, qty) => onStockChange(i, qty)}
            onRemove={(i) => removeSizeRow(form, sizes, i)}
          />
        );
      })}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button
          type="button"
          variant="secondary"
          className="h-8 px-2.5 text-xs text-primary"
          onClick={() => addSizeRow(form, sizes)}
        >
          <span aria-hidden="true">+ </span>Add size
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-8 px-2.5 text-xs"
          onClick={onAddOption}
        >
          Add option
        </Button>
      </div>
    </div>
  );
}

function applySizesPreset(form: UseFormReturn<ProductFormValues>, presetSizes: readonly string[]) {
  const list = [...presetSizes];
  const current = form.getValues('variants') ?? [];
  form.setValue('options', [{ name: 'Size', values: list }], { shouldDirty: true });
  form.setValue(
    'variants',
    list.map((size, index) => ({
      id: current[index]?.id,
      optionValues: { 0: size },
      sku: current[index]?.sku ?? null,
      priceOverridePoisha: current[index]?.priceOverridePoisha ?? '',
      costPoisha: current[index]?.costPoisha ?? '',
      initialStock: current[index]?.initialStock ?? 0,
    })),
    { shouldDirty: true },
  );
}

function addSizeRow(form: UseFormReturn<ProductFormValues>, sizes: string[]) {
  const list = sizes.length ? [...sizes, ''] : [''];
  form.setValue('options', [{ name: 'Size', values: list }], { shouldDirty: true });
  const current = form.getValues('variants') ?? [];
  form.setValue(
    'variants',
    [
      ...current,
      {
        optionValues: { 0: '' },
        sku: null,
        priceOverridePoisha: '',
        costPoisha: '',
        initialStock: 0,
      },
    ],
    { shouldDirty: true },
  );
}

function removeSizeRow(form: UseFormReturn<ProductFormValues>, sizes: string[], index: number) {
  const remaining = sizes.filter((_, i) => i !== index);
  const current = form.getValues('variants') ?? [];
  const updated = current.filter((_, i) => i !== index);
  form.setValue('options', remaining.length ? [{ name: 'Size', values: remaining }] : [], {
    shouldDirty: true,
  });
  form.setValue(
    'variants',
    remaining.length
      ? updated
      : [
          {
            optionValues: {},
            sku: null,
            priceOverridePoisha: '',
            costPoisha: '',
            initialStock: 0,
          },
        ],
    { shouldDirty: true },
  );
}

function updateSizeName(form: UseFormReturn<ProductFormValues>, index: number, name: string) {
  const options = form.getValues('options') ?? [];
  const list = [...(options[0]?.values ?? [])];
  list[index] = name;
  form.setValue('options', [{ name: 'Size', values: list }], { shouldDirty: true });
  const current = form.getValues('variants') ?? [];
  if (current[index]) {
    const updated = [...current];
    updated[index] = {
      ...updated[index]!,
      optionValues: { ...updated[index]!.optionValues, 0: name },
    };
    form.setValue('variants', updated, { shouldDirty: true });
  }
}

type ProductSizeRowProps = {
  index: number;
  size: string;
  stock: number;
  onUpdate: (index: number, name: string) => void;
  onStockChange: (index: number, quantity: number) => void;
  onRemove: (index: number) => void;
};

function ProductSizeRow({
  index,
  size,
  stock,
  onUpdate,
  onStockChange,
  onRemove,
}: ProductSizeRowProps) {
  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Size"
        value={size}
        aria-label={`Size ${index + 1}`}
        onChange={(event) => onUpdate(index, event.target.value)}
        className="flex-1"
      />
      <Input
        type="number"
        min="0"
        value={stock === 0 ? '' : stock}
        placeholder="0"
        aria-label={`Stock for size ${size || index + 1}`}
        onChange={(event) => {
          const val = Number.parseInt(event.target.value, 10);
          onStockChange(index, Number.isNaN(val) || val < 0 ? 0 : val);
        }}
        className="w-20 text-center"
      />
      <button
        type="button"
        aria-label={`Delete size ${size || index + 1}`}
        onClick={() => onRemove(index)}
        className="rounded-md p-1.5 text-text-muted hover:bg-surface-muted hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
