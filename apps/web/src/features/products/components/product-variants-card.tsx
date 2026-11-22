'use client';
import { useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';

import { rowKey, variantLabel } from '../product-variant-grid';
import { ProductInputField } from './product-input-field';
import { ProductOptionEditor, useGridOptions } from './product-option-editor';
import { ProductWarnAtField } from './product-warn-at-field';

export function ProductVariantsCard() {
  const form = useFormContext<ProductFormValues>();
  const { options, setOptions } = useGridOptions();
  const errors = form.formState.errors.variants;
  const error = errors?.message ?? errors?.root?.message;
  const addOption = () => setOptions([...options, { name: '', values: [] }]);
  const hasOptions = options.length > 0;
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-text">Variants</h2>
      {hasOptions ? null : <PlainStock />}
      <div className="flex flex-wrap items-center gap-2">
        {hasOptions ? null : <AddOptionsButton onClick={addOption} />}
      </div>
      {hasOptions ? (
        <OptionsAndGrid onAddOption={addOption} />
      ) : (
        <p className="text-sm text-text-muted">
          This product has no sizes or colours. Adding the first option turns this stock and code
          into the first grid row. Nothing is lost.
        </p>
      )}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type OptionsAndGridProps = { onAddOption: () => void };

function OptionsAndGrid({ onAddOption }: OptionsAndGridProps) {
  const { options } = useGridOptions();
  return (
    <>
      <ProductOptionEditor onAddOption={onAddOption} />
      {options.some((option) => option.values.length) ? (
        <VariantSummary />
      ) : (
        <p className="text-sm text-text-muted">Type a value above and the grid builds itself.</p>
      )}
    </>
  );
}

// The grid that edits each row comes in the next change; until then rows are listed.
function VariantSummary() {
  const { options, variants } = useGridOptions();
  return (
    <ul className="space-y-1 text-sm text-text">
      {variants.map((variant) => (
        <li key={rowKey(variant)}>{variantLabel(variant, options)}</li>
      ))}
    </ul>
  );
}

function AddOptionsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" className="h-8 px-2.5 text-xs" onClick={onClick}>
      Add options
    </Button>
  );
}

function PlainStock() {
  const form = useFormContext<ProductFormValues>();
  const stock = form.watch('variants.0.initialStock');
  if (form.watch('isStockTracked') === false)
    return (
      <ProductInputField
        name="variants.0.sku"
        label="Product code"
        placeholder="e.g. UT-PJ-01"
        optional
      />
    );
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <FormField name="variants.0.initialStock" label="Stock">
        {(control) => (
          <Input
            {...control}
            inputMode="numeric"
            value={String(stock ?? 0)}
            onChange={(event) =>
              form.setValue(
                'variants.0.initialStock',
                Number(event.target.value.replace(/\D/g, '')) || 0,
                {
                  shouldDirty: true,
                },
              )
            }
          />
        )}
      </FormField>
      <ProductInputField
        name="variants.0.sku"
        label="Product code"
        placeholder="e.g. UT-PJ-01"
        optional
      />
      <ProductWarnAtField />
    </div>
  );
}
