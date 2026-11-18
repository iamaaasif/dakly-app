import { Controller, useFieldArray, useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Textarea } from '@dakly/ui/textarea';

import { ProductVariants } from './product-variants';

export function ProductOptions() {
  const form = useFormContext<ProductFormValues>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'options' });
  function rename(previous: string, next?: string) {
    form.setValue(
      'variants',
      (form.getValues('variants') ?? []).map((variant) => ({
        ...variant,
        optionValues: Object.fromEntries(
          Object.entries(variant.optionValues ?? {}).flatMap(([name, value]) =>
            name === previous.trim()
              ? next === undefined
                ? []
                : [[next.trim(), value]]
              : [[name, value]],
          ),
        ),
      })),
    );
  }
  const options = form.watch('options') ?? [];
  return (
    <>
      <fieldset className="space-y-4">
        <legend className="font-semibold">Options</legend>
        {fields.map((option, index) => (
          <div key={option.id} className="space-y-3 rounded-lg border border-border p-4">
            <FormField name={`options.${index}.name`} label={`Option ${index + 1} name`}>
              {(control) => (
                <Controller
                  control={form.control}
                  name={`options.${index}.name`}
                  render={({ field }) => (
                    <Input
                      {...control}
                      {...field}
                      onChange={(event) => {
                        rename(field.value ?? '', event.target.value);
                        field.onChange(event);
                      }}
                    />
                  )}
                />
              )}
            </FormField>
            <FormField
              name={`options.${index}.values`}
              label={`Option ${index + 1} values`}
              hint="One value per line."
            >
              {(control) => (
                <Controller
                  control={form.control}
                  name={`options.${index}.values`}
                  render={({ field }) => (
                    <Textarea
                      {...control}
                      value={field.value?.join('\n') ?? ''}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      onChange={(event) => field.onChange(event.target.value.split('\n'))}
                    />
                  )}
                />
              )}
            </FormField>
            <Button
              variant="secondary"
              onClick={() => {
                rename(form.getValues(`options.${index}.name`) ?? '');
                remove(index);
              }}
            >
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
        options={fields.map((field, index) => ({ ...options[index]!, fieldKey: field.id }))}
      />
    </>
  );
}
