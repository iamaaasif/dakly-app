'use client';
import { RefreshCw } from 'lucide-react';
import { useRef } from 'react';
import { useFormContext } from 'react-hook-form';

import type { ProductFormValues, ProductResponse } from '@dakly/contracts/products';
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
      <fieldset disabled={readOnly} className="min-w-0">
        <ProductOptionEditor product={product} onDraftChange={onOptionDraftChange} />
      </fieldset>
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
  const input = useRef<HTMLInputElement | null>(null);
  const { ref, ...registered } = form.register('variants.0.sku');
  function handleGenerate() {
    const code = crypto.randomUUID().slice(0, 12).replace('-', '').toUpperCase();
    form.setValue('variants.0.sku', `SKU-${code}`, { shouldDirty: true, shouldValidate: true });
    // The code is selected so one more key press replaces it.
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.select();
    });
  }
  return (
    <FormField
      name="variants.0.sku"
      label="SKU (stock keeping unit)"
      optional
      action={
        <button
          type="button"
          onClick={handleGenerate}
          className="inline-flex items-center gap-1 rounded-md px-1 text-sm font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-focus"
        >
          <RefreshCw aria-hidden="true" size={14} strokeWidth={1.75} />
          Generate
        </button>
      }
    >
      {(control) => (
        <Input
          {...control}
          {...registered}
          ref={(element) => {
            ref(element);
            input.current = element;
          }}
          placeholder="e.g. UT-PJ-01"
        />
      )}
    </FormField>
  );
}
