import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';

import { ProductDescriptionField } from './product-description-field';
import { ProductInputField } from './product-input-field';
import { ProductLinesField } from './product-lines-field';

const flags = [
  ['isStockTracked', 'Track stock'],
  ['isVisibleInChats', 'Show in chat replies'],
  ['isVisibleInOrderLink', 'Show in the order link'],
] as const;
type ProductFieldsProps = { productId?: string };
export function ProductFields({ productId }: ProductFieldsProps) {
  const form = useFormContext<ProductFormValues>();
  const visibleFlags = flags.filter(([name]) => productId || name === 'isStockTracked');
  const simple = !form.watch('options')?.length && form.watch('variants')?.length === 1;
  return (
    <>
      <ProductInputField name="name" label="Name" />
      <div className="grid gap-4 md:grid-cols-2">
        <ProductInputField name="category" label="Category" />
        {simple ? <ProductInputField name="variants.0.sku" label="Product code" /> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ProductInputField name="pricePoisha" label="Selling price (Taka)" />
        <ProductInputField name="compareAtPricePoisha" label="Old price (Taka)" />
        {simple ? (
          <ProductInputField name="variants.0.costPoisha" label="Your cost (Taka)" />
        ) : null}
      </div>
      {simple ? <DefaultOverride /> : null}
      <ProductDescriptionField productId={productId} />
      {productId ? (
        <ProductLinesField name="aliases" label="Other names" hint="One name per line." />
      ) : null}
      <div className="space-y-4">
        {visibleFlags.map(([name, label]) => (
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
    </>
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
