'use client';
import { useFormContext } from 'react-hook-form';

import type { ProductFormValues, ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { ProductOptionEditor, useGridOptions } from './product-option-editor';
import { ProductTrackStock } from './product-track-stock';
import { ProductVariantTable } from './product-variant-table';
import { ProductWarnAtField } from './product-warn-at-field';

type ProductVariantsCardProps = {
  product?: ProductResponse;
  readOnly?: boolean;
  onOptionDraftChange: (editing: boolean) => void;
};

export function ProductVariantsCard({
  product,
  readOnly,
  onOptionDraftChange,
}: ProductVariantsCardProps) {
  const form = useFormContext<ProductFormValues>();
  const { options } = useGridOptions();
  const errors = form.formState.errors.variants;
  const error = errors?.message ?? errors?.root?.message;
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-text">Variations</h2>
      <ProductOptionEditor product={product} onDraftChange={onOptionDraftChange} />
      {options.length ? <ProductVariantTable product={product} readOnly={readOnly} /> : null}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ProductInventory() {
  const form = useFormContext<ProductFormValues>();
  const stock = form.watch('variants.0.initialStock');
  const tracked = form.watch('isStockTracked');
  const hasOptions = Boolean(form.watch('options')?.length);
  return (
    <>
      <ProductTrackStock />
      {hasOptions && tracked ? <ProductWarnAtField /> : null}
      {hasOptions ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          {tracked ? (
            <>
              <FormField name="variants.0.initialStock" label="Available stock">
                {(control) => (
                  <Input
                    {...control}
                    inputMode="numeric"
                    value={String(stock ?? 0)}
                    onChange={(event) =>
                      form.setValue(
                        'variants.0.initialStock',
                        Number(event.target.value.replace(/\D/g, '')) || 0,
                        { shouldDirty: true },
                      )
                    }
                  />
                )}
              </FormField>
              <ProductWarnAtField />
            </>
          ) : null}
          <ProductSkuField />
        </div>
      )}
    </>
  );
}

function ProductSkuField() {
  const form = useFormContext<ProductFormValues>();
  return (
    <FormField
      name="variants.0.sku"
      label="Product code"
      optional
      action={
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const code = crypto.randomUUID().slice(0, 12).replace('-', '').toUpperCase();
            form.setValue('variants.0.sku', `SKU-${code}`, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
        >
          Generate
        </Button>
      }
    >
      {(control) => (
        <Input {...control} {...form.register('variants.0.sku')} placeholder="e.g. UT-PJ-01" />
      )}
    </FormField>
  );
}
