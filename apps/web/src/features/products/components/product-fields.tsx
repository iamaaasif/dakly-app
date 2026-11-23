import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';

import { profitPercent } from '../product-variant-grid';
import { ProductCategoryField } from './product-category-field';
import { ProductDescriptionField } from './product-description-field';
import { ProductInputField } from './product-input-field';
import { ProductLinesField } from './product-lines-field';
import { ProductTrackStock } from './product-track-stock';
import { ProductWarnAtField } from './product-warn-at-field';

const extraFlags = [
  ['isVisibleInChats', 'Show in chat replies'],
  ['isVisibleInOrderLink', 'Show in the order link'],
] as const;
type ProductFieldsProps = { productId?: string; showCode?: boolean; withWarnAt?: boolean };

// The modal shows every field in one flow; the full page puts the same parts in titled cards.
export function ProductFields({ productId }: ProductFieldsProps) {
  return (
    <>
      <ProductNameFields productId={productId} />
      <ProductPriceFields productId={productId} />
      <ProductDescriptionFields productId={productId} />
      <ProductStockFields productId={productId} />
    </>
  );
}

function useShowSkuAndCost(productId?: string) {
  const form = useFormContext<ProductFormValues>();
  const simple = !form.watch('options')?.length && form.watch('variants')?.length === 1;
  return { simple, showSkuAndCost: !productId || simple };
}

export function ProductNameFields({ productId, showCode = true }: ProductFieldsProps) {
  const { showSkuAndCost } = useShowSkuAndCost(productId);
  return (
    <>
      <ProductInputField
        name="name"
        label="Name"
        placeholder="e.g. Cotton Panjabi"
        autoFocus={!productId}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <ProductCategoryField />
        {showSkuAndCost && showCode ? (
          <ProductInputField
            name="variants.0.sku"
            label="Product code"
            placeholder="e.g. UT-PJ-01"
            optional
          />
        ) : null}
      </div>
    </>
  );
}

export function ProductPriceFields({ productId }: ProductFieldsProps) {
  const { simple, showSkuAndCost } = useShowSkuAndCost(productId);
  return (
    <>
      <div className={simple ? 'grid gap-3 md:grid-cols-4' : 'grid gap-3 md:grid-cols-3'}>
        <ProductInputField name="pricePoisha" label="Selling price ৳" />
        <ProductInputField name="compareAtPricePoisha" label="Old price ৳" placeholder="Optional" />
        {showSkuAndCost ? (
          <ProductInputField
            name="variants.0.costPoisha"
            label="Your cost ৳"
            placeholder="Optional"
          />
        ) : null}
        {simple ? <PlainProfit /> : null}
      </div>
      {simple ? <DefaultOverride /> : null}
    </>
  );
}

export function ProductDeliveryFields() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ProductInputField
        name="weightGrams"
        label="Parcel weight (grams)"
        placeholder="e.g. 500"
        optional
      />
      <p className="self-end pb-2 text-sm text-text-muted">
        Used for courier charges. Orders add it up so you do not retype it.
      </p>
    </div>
  );
}

export function ProductDescriptionFields({ productId }: ProductFieldsProps) {
  return (
    <>
      <ProductDescriptionField productId={productId} />
      {productId ? (
        <ProductLinesField name="aliases" label="Other names" hint="One name per line." />
      ) : null}
    </>
  );
}

export function ProductStockFields({ productId, withWarnAt }: ProductFieldsProps) {
  const form = useFormContext<ProductFormValues>();
  const hasOptions = Boolean(form.watch('options')?.length);
  return (
    <>
      <ProductTrackStock />
      {withWarnAt && hasOptions ? <ProductWarnAtField /> : null}
      {productId ? <ExtraFlags /> : null}
    </>
  );
}

function ExtraFlags() {
  const form = useFormContext<ProductFormValues>();
  return (
    <div className="space-y-3">
      {extraFlags.map(([name, label]) => (
        <FormField key={name} name={name} label={label}>
          {(control) => (
            <Controller
              control={form.control}
              name={name}
              render={({ field }) => (
                <Checkbox
                  {...control}
                  checked={field.value}
                  onCheckedChange={(value) => field.onChange(value === true)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                />
              )}
            />
          )}
        </FormField>
      ))}
    </div>
  );
}

function PlainProfit() {
  const form = useFormContext<ProductFormValues>();
  const profit = profitPercent(form.watch('pricePoisha'), form.watch('variants.0.costPoisha'));
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-text">Profit</p>
      <p className="flex min-h-10 items-center text-success">
        {profit === null ? '' : `${profit}%`}
      </p>
    </div>
  );
}

function DefaultOverride() {
  const { getValues } = useFormContext<ProductFormValues>();
  const [visible] = useState(() => Boolean(getValues('variants.0.priceOverridePoisha')));
  if (!visible) return null;
  return (
    <ProductInputField
      name="variants.0.priceOverridePoisha"
      label="Default price override (Taka)"
    />
  );
}
