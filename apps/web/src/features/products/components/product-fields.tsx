'use client';
import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';

import { ProductCategoryField } from './product-category-field';
import { ProductDescriptionField } from './product-description-field';
import { ProductInputField } from './product-input-field';
import { ProductLinesField } from './product-lines-field';
import { ProductTrackStock } from './product-track-stock';

const extraFlags = [
  ['isVisibleInChats', 'Show in chat replies'],
  ['isVisibleInOrderLink', 'Show in the order link'],
] as const;

type ProductFieldsProps = { productId?: string };

export function ProductFields({ productId }: ProductFieldsProps) {
  const form = useFormContext<ProductFormValues>();
  const simple = !form.watch('options')?.length && form.watch('variants')?.length === 1;
  const showSkuAndCost = !productId || simple;

  return (
    <>
      <ProductInputField name="name" label="Name" placeholder="e.g. Cotton Panjabi" />
      <div className="grid gap-3 md:grid-cols-2">
        <ProductCategoryField />
        {showSkuAndCost ? (
          <ProductInputField
            name="variants.0.sku"
            label="Product code"
            placeholder="e.g. UT-PJ-01"
            optional
          />
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <ProductInputField name="pricePoisha" label="Selling price ৳" />
        <ProductInputField name="compareAtPricePoisha" label="Old price ৳" placeholder="Optional" />
        {showSkuAndCost ? (
          <ProductInputField
            name="variants.0.costPoisha"
            label="Your cost ৳"
            placeholder="Optional"
          />
        ) : null}
      </div>
      {simple ? <DefaultOverride /> : null}
      <ProductDescriptionField productId={productId} />
      {productId ? (
        <ProductLinesField name="aliases" label="Other names" hint="One name per line." />
      ) : null}
      <ProductTrackStock />
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
