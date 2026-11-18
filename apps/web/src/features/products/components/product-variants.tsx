import { Controller, useFieldArray, useFormContext } from 'react-hook-form';

import type { ProductFormValues, ProductOption } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';

import { ProductInputField } from './product-input-field';

type ProductVariantsProps = { options: (ProductOption & { fieldKey: string; index: number })[] };
export function ProductVariants({ options }: ProductVariantsProps) {
  const form = useFormContext<ProductFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'variants',
    keyName: 'fieldId',
  });
  const errors = form.formState.errors.variants;
  const error = errors?.message ?? errors?.root?.message;
  const namedOptions = options
    .map((option) => ({
      ...option,
      name: option.name.trim(),
      values: option.values.map((value) => value.trim()),
    }))
    .filter((option) => option.name);
  return (
    <fieldset className="space-y-4">
      {options.length || fields.length > 1 ? (
        <>
          <legend className="font-semibold">Variants</legend>
          {fields.map((variant, index) => (
            <VariantFields
              key={variant.fieldId}
              index={index}
              options={namedOptions}
              onRemove={fields.length > 1 ? () => remove(index) : undefined}
            />
          ))}
          {options.length && fields.length < 100 ? (
            <Button
              variant="secondary"
              onClick={() =>
                append({ optionValues: {}, sku: null, priceOverridePoisha: '', costPoisha: '' })
              }
            >
              Add variant
            </Button>
          ) : null}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

type VariantFieldsProps = ProductVariantsProps & { index: number; onRemove?: () => void };
function VariantFields({ index, options: namedOptions, onRemove }: VariantFieldsProps) {
  const form = useFormContext<ProductFormValues>();
  return (
    <div className="space-y-3 rounded-lg border border-border p-4 wrap-anywhere">
      <h3 className="font-semibold">Variant {index + 1}</h3>
      {namedOptions.map((option) => (
        <FormField
          key={option.fieldKey}
          name={`variants.${index}.optionValues`}
          label={`${option.name} for variant ${index + 1}`}
        >
          {(control) => (
            <Controller
              control={form.control}
              name={`variants.${index}.optionValues`}
              render={({ field }) => (
                <select
                  {...control}
                  ref={field.ref}
                  className="min-h-10 w-full min-w-0 rounded-md border border-input-border bg-surface px-3 aria-invalid:border-danger"
                  value={option.values.find((item) => item === field.value?.[option.index]) ?? ''}
                  onBlur={field.onBlur}
                  onChange={(event) =>
                    field.onChange({ ...field.value, [option.index]: event.target.value })
                  }
                >
                  <option value="" disabled>
                    Choose a value
                  </option>
                  {[...new Set(option.values.filter(Boolean))].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              )}
            />
          )}
        </FormField>
      ))}
      <ProductInputField
        name={`variants.${index}.sku`}
        label={`Product code for variant ${index + 1}`}
      />
      <ProductInputField
        name={`variants.${index}.priceOverridePoisha`}
        label={`Price override for variant ${index + 1} (Taka)`}
      />
      <ProductInputField
        name={`variants.${index}.costPoisha`}
        label={`Cost for variant ${index + 1} (Taka)`}
      />
      {onRemove ? (
        <Button variant="secondary" onClick={onRemove}>
          Remove variant {index + 1}
        </Button>
      ) : null}
    </div>
  );
}
