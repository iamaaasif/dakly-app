'use client';
import type { UseFieldArrayRemove, UseFormReturn } from 'react-hook-form';
import { useFieldArray, useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';

import { ProductInputField } from './product-input-field';
import { ProductLinesField } from './product-lines-field';
import { ProductSizes } from './product-sizes';
import { ProductVariants } from './product-variants';

type ProductOptionsProps = {
  mode: 'create' | 'edit';
  onStockChange: (index: number, quantity: number) => void;
};

export function ProductOptions({ mode, onStockChange }: ProductOptionsProps) {
  const form = useFormContext<ProductFormValues>();
  const isStockTracked = form.watch('isStockTracked');
  const options = form.watch('options') ?? [];
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'options' });

  const isSizesOnly =
    options.length === 0 || (options.length === 1 && options[0]?.name.toLowerCase() === 'size');

  if (mode === 'create' && isStockTracked && isSizesOnly) {
    return (
      <ProductSizes
        onStockChange={onStockChange}
        onAddOption={() => append({ name: '', values: [] })}
      />
    );
  }

  return (
    <>
      <fieldset className="space-y-4">
        <legend className="font-semibold">Options</legend>
        {fields.map((option, index) => (
          <OptionCard
            key={option.id}
            index={index}
            onRemove={() => removeOption(form, remove, index)}
          />
        ))}
        {fields.length < 3 ? (
          <Button variant="secondary" onClick={() => append({ name: '', values: [] })}>
            Add option
          </Button>
        ) : null}
      </fieldset>
      <ProductVariants
        options={fields.map((field, index) => ({
          ...options[index]!,
          fieldKey: field.id,
          index,
        }))}
      />
    </>
  );
}

function OptionCard({ index, onRemove }: { index: number; onRemove: () => void }) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <ProductInputField name={`options.${index}.name`} label={`Option ${index + 1} name`} />
      <ProductLinesField
        name={`options.${index}.values`}
        label={`Option ${index + 1} values`}
        hint="One value per line."
      />
      <Button variant="secondary" onClick={onRemove}>
        Remove option {index + 1}
      </Button>
    </div>
  );
}

function removeOption(
  form: UseFormReturn<ProductFormValues>,
  remove: UseFieldArrayRemove,
  index: number,
) {
  form.setValue(
    'variants',
    (form.getValues('variants') ?? []).map((variant) => ({
      ...variant,
      optionValues: Object.fromEntries(
        Object.entries(variant.optionValues ?? {}).flatMap(([key, value]) => {
          const position = Number(key);
          if (position === index) return [];
          return [[position > index ? position - 1 : position, value]];
        }),
      ),
    })),
  );
  remove(index);
}
