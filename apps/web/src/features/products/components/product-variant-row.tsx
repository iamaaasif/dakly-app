'use client';
import { Camera, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { useFormContext } from 'react-hook-form';

import { formatMoney } from '@dakly/contracts/money';
import type { ProductFormValues, ProductVariantResponse } from '@dakly/contracts/products';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';
import { Input } from '@dakly/ui/input';

import { useUploadProductPhoto } from '../api/upload-product-photo';
import {
  profitPercent,
  rowStock,
  variantLabel,
  type EditableField,
  type GridOption,
  type GridVariant,
} from '../product-variant-grid';

export type VariantRowProps = {
  index: number;
  variant: GridVariant;
  options: GridOption[];
  productPrice: string;
  productId?: string;
  saved?: ProductVariantResponse;
  showStock: boolean;
  selected: boolean;
  open: boolean;
  onSelect: (selected: boolean) => void;
  onToggle: () => void;
  onChange: (field: EditableField, value: string) => void;
};

export const variantGridColumns =
  'md:grid-cols-[2rem_3rem_minmax(0,1fr)_6rem_6rem_4rem_5rem_7rem] md:gap-2 md:px-3';

export function VariantRow(props: VariantRowProps) {
  const { variant, options, productPrice, saved, showStock, selected, open } = props;
  const label = variantLabel(variant, options);
  const price = variant.priceOverridePoisha || productPrice;
  const profit = profitPercent(price, variant.costPoisha);
  return (
    <li className={cn('border-t border-border md:grid md:items-start md:py-2', variantGridColumns)}>
      <div className="flex items-center gap-2 py-2 md:contents md:py-0">
        <Checkbox
          aria-label={`Select ${label}`}
          checked={selected}
          onCheckedChange={(value) => props.onSelect(value === true)}
          className="md:mt-2"
        />
        <PhotoCell productId={props.productId} saved={saved} label={label} />
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${label} summary`}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-text md:mt-2 md:cursor-default"
          onClick={props.onToggle}
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <span className="shrink-0 font-normal text-text-muted md:hidden">
            {summaryPrice(price)}
            {showStock ? ` · ${rowStock(variant)} pcs` : ''}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 shrink-0 text-text-muted md:hidden', open && 'rotate-180')}
          />
        </button>
      </div>
      <div className={cn(open ? 'grid grid-cols-2 gap-2 pb-3' : 'hidden', 'md:contents')}>
        <Cell
          {...props}
          field="priceOverridePoisha"
          label="Price"
          name={label}
          placeholder={productPrice}
        />
        <Cell {...props} field="costPoisha" label="Cost" name={label} />
        <p
          className="order-last col-span-2 text-sm text-success md:order-none md:col-span-1 md:mt-2.5"
          aria-label={`Profit for ${label}`}
        >
          {profit === null ? '' : <ProfitText percent={profit} />}
        </p>
        {showStock ? <Cell {...props} field="initialStock" label="Stock" name={label} /> : <span />}
        <Cell {...props} field="sku" label="Code" name={label} placeholder="Code" />
      </div>
    </li>
  );
}

function summaryPrice(taka: string): string {
  const poisha = Math.round(Number(taka) * 100);
  return taka.trim() && Number.isFinite(poisha) ? formatMoney(poisha) : 'No price';
}

type CellProps = VariantRowProps & {
  field: EditableField;
  label: string;
  name: string;
  placeholder?: string;
};

function Cell({ field, label, name, placeholder, variant, index, onChange }: CellProps) {
  const { formState } = useFormContext<ProductFormValues>();
  const error = formState.errors.variants?.[index]?.[field]?.message;
  return (
    <div>
      <span aria-hidden="true" className="block text-xs text-text-muted md:hidden">
        {label}
      </span>
      <Input
        aria-label={`${label} for ${name}`}
        aria-invalid={error ? true : undefined}
        inputMode={field === 'sku' ? undefined : 'decimal'}
        placeholder={placeholder}
        value={String(variant[field] ?? '')}
        data-grid-row={index}
        data-grid-field={field}
        className="mt-0.5 min-h-9 px-2 py-1 text-sm"
        onChange={(event) => onChange(field, event.target.value)}
      />
      {error ? <p className="mt-0.5 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

// A saved variant can take its own photo at once; a new row has nothing to attach it to yet.
function PhotoCell({
  productId,
  saved,
  label,
}: {
  productId?: string;
  saved?: ProductVariantResponse;
  label: string;
}) {
  if (!productId || !saved)
    return (
      <span
        aria-hidden="true"
        className="size-10 rounded-md border border-dashed border-border-strong"
      />
    );
  return <SavedPhotoCell productId={productId} saved={saved} label={label} />;
}

function SavedPhotoCell({
  productId,
  saved,
  label,
}: {
  productId: string;
  saved: ProductVariantResponse;
  label: string;
}) {
  const upload = useUploadProductPhoto(productId, saved.id);
  const photo = saved.photos[0];
  return (
    <label
      title={upload.error?.message ?? `Photo for ${label}`}
      className="relative grid size-10 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md border border-dashed border-border-strong text-text-muted focus-within:outline-2 focus-within:outline-focus"
    >
      {photo ? (
        <Image
          src={photo.url}
          alt=""
          width={40}
          height={40}
          unoptimized
          className="size-10 object-cover"
        />
      ) : (
        <Camera aria-hidden="true" className="size-4" />
      )}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`Photo for ${label}`}
        className="sr-only"
        disabled={upload.isPending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file);
          event.target.value = '';
        }}
      />
    </label>
  );
}

function ProfitText({ percent }: { percent: number }) {
  return (
    <>
      <span className="md:hidden">Profit </span>
      {percent}%
    </>
  );
}
