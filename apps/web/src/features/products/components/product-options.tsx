import { useFieldArray, useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';

import { ProductInputField } from './product-input-field';
import { ProductLinesField } from './product-lines-field';
import { ProductVariants } from './product-variants';

export function ProductOptions() {
  const form = useFormContext<ProductFormValues>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'options' });
  function removeOption(index: number) {
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
  const options = form.watch('options') ?? [];
  return (
    <>
      <fieldset className="space-y-4">
        <legend className="font-semibold">Options</legend>
        {fields.map((option, index) => (
          <div key={option.id} className="space-y-3 rounded-lg border border-border p-4">
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
