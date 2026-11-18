import { Controller, useFieldArray, useFormContext } from 'react-hook-form';

import type { ProductFormValues, ProductOption } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@dakly/ui/select';

import { ProductMoneyField } from './product-money-field';

type ProductVariantsProps = { options: (ProductOption & { fieldKey: string })[] };
export function ProductVariants({ options }: ProductVariantsProps) {
  const form = useFormContext<ProductFormValues>();
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'variants',
    keyName: 'fieldId',
  });
  const error = form.formState.errors.variants?.message;
  const namedOptions = options
    .map((option) => ({ ...option, name: option.name.trim() }))
    .filter((option) => option.name);
  return (
    <fieldset className="space-y-4">
      {options.length || fields.length > 1 ? (
        <>
          <legend className="font-semibold">Variants</legend>
          {fields.map((variant, index) => (
            <div key={variant.fieldId} className="space-y-3 rounded-lg border border-border p-4">
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
                        <Select
                          value={field.value?.[option.name] ?? ''}
                          onValueChange={(value) =>
                            field.onChange({ ...field.value, [option.name]: value })
                          }
                        >
                          <SelectTrigger {...control} ref={field.ref} onBlur={field.onBlur}>
                            <SelectValue placeholder="Choose a value" />
                          </SelectTrigger>
                          <SelectContent>
                            {[...new Set(option.values.filter(Boolean))].map((value) => (
                              <SelectItem key={value} value={value}>
                                {value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  )}
                </FormField>
              ))}
              <FormField
                name={`variants.${index}.sku`}
                label={`Product code for variant ${index + 1}`}
              >
                {(control) => (
                  <Input
                    {...control}
                    {...form.register(`variants.${index}.sku`, {
                      setValueAs: (value: string | null) => value?.trim() || null,
                    })}
                  />
                )}
              </FormField>
              <ProductMoneyField
                name={`variants.${index}.priceOverridePoisha`}
                label={`Price override for variant ${index + 1} (Taka)`}
              />
              <ProductMoneyField
                name={`variants.${index}.costPoisha`}
                label={`Cost for variant ${index + 1} (Taka)`}
              />
              {fields.length > 1 ? (
                <Button variant="secondary" onClick={() => remove(index)}>
                  Remove variant {index + 1}
                </Button>
              ) : null}
            </div>
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
