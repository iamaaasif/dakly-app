'use client';
import { useFieldArray, useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';

import { ProductInputField } from './product-input-field';
import { ProductLinesField } from './product-lines-field';
import { ProductSizes } from './product-sizes';
import { ProductVariants } from './product-variants';

type ProductOptionsProps = {
  mode: 'create' | 'edit';
};

export function ProductOptions({ mode }: ProductOptionsProps) {
  const form = useFormContext<ProductFormValues>();
  const isStockTracked = form.watch('isStockTracked');
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'options' });

  function removeOption(index: number) {
    const variants = form.getValues('variants') ?? [];
    form.setValue(
      'variants',
      variants.map((variant) => ({
        ...variant,
        optionValues: Object.fromEntries(
          Object.entries(variant.optionValues ?? {}).flatMap(([key, value]) => {
            const pos = Number(key);
            if (pos === index) return [];
            return [[pos > index ? pos - 1 : pos, value]];
          }),
        ),
      })),
    );
    remove(index);
  }

  const isSingleSize =
    fields.length === 0 || (fields.length === 1 && fields[0]?.name.toLowerCase() === 'size');

  if (mode === 'create' && isStockTracked && isSingleSize) {
    return (
      <ProductSizes
        onAddOption={fields.length < 3 ? () => append({ name: '', values: [] }) : undefined}
      />
    );
  }

  const options = form.watch('options') ?? [];
  return (
    <>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-text">Options</legend>
        {fields.map((option, index) => (
          <div key={option.id} className="space-y-3 rounded-lg border border-border p-3">
            <ProductInputField name={`options.${index}.name`} label={`Option ${index + 1} name`} />
            <ProductLinesField
              name={`options.${index}.values`}
              label={`Option ${index + 1} values`}
              hint="One value per line."
            />
            <Button variant="secondary" onClick={() => removeOption(index)}>
              Remove option {index + 1}
            </Button>
          </div>
        ))}
        {fields.length < 3 ? (
          <Button variant="secondary" onClick={() => append({ name: '', values: [] })}>
            Add option
          </Button>
        ) : null}
      </fieldset>
      <ProductVariants
        options={fields.map((field, index) => ({ ...options[index]!, fieldKey: field.id, index }))}
      />
    </>
  );
}
