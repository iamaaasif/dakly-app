'use client';
import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';

import { ProductCategoryField } from './product-category-field';
import { ProductInputField } from './product-input-field';
import { ProductLinesField } from './product-lines-field';
import { ProductTrackStock } from './product-track-stock';

const extraFlags = [
  ['isVisibleInChats', 'Show in chat replies'],
  ['isVisibleInOrderLink', 'Show in the order link'],
] as const;

type ProductFieldsProps = { mode: 'create' | 'edit' };

export function ProductFields({ mode }: ProductFieldsProps) {
  const form = useFormContext<ProductFormValues>();
  const simple = !form.watch('options')?.length && form.watch('variants')?.length === 1;

  return (
    <>
      <ProductInputField name="name" label="Name" placeholder="e.g. Cotton Panjabi" />
      <div className="grid gap-3 md:grid-cols-2">
        <ProductCategoryField />
        {simple ? (
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
        {simple ? (
          <ProductInputField
            name="variants.0.costPoisha"
            label="Your cost ৳"
            placeholder="Optional"
          />
        ) : null}
      </div>
      {simple ? <DefaultOverride /> : null}
      <ProductLinesField
        name="description"
        label="Description"
        placeholder="Fabric, fit, what makes it special"
        rows={3}
      />
      {mode === 'edit' ? (
        <ProductLinesField name="aliases" label="Other names" hint="One name per line." />
      ) : null}
      <ProductTrackStock />
      {mode === 'edit' ? <ExtraFlags /> : null}
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
  return visible ? (
    <ProductInputField
      name="variants.0.priceOverridePoisha"
      label="Default price override (Taka)"
    />
  ) : null;
}
