import { Controller, useFormContext } from 'react-hook-form';

import type { ProductFormValues } from '@dakly/contracts/products';
import { Checkbox } from '@dakly/ui/checkbox';
import { FormField } from '@dakly/ui/form-field';
import { Input } from '@dakly/ui/input';
import { Textarea } from '@dakly/ui/textarea';

import { ProductMoneyField } from './product-money-field';

export function ProductFields() {
  const form = useFormContext<ProductFormValues>();
  const simple = !form.watch('options')?.length && form.watch('variants')?.length === 1;
  return (
    <>
      <FormField name="name" label="Name">
        {(control) => <Input {...control} {...form.register('name')} />}
      </FormField>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField name="category" label="Category">
          {(control) => (
            <Input
              {...control}
              {...form.register('category', {
                setValueAs: (value: string | null) => value?.trim() || null,
              })}
            />
          )}
        </FormField>
        {simple ? (
          <FormField name="variants.0.sku" label="Product code">
            {(control) => (
              <Input
                {...control}
                {...form.register('variants.0.sku', {
                  setValueAs: (value: string | null) => value?.trim() || null,
                })}
              />
            )}
          </FormField>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ProductMoneyField name="pricePoisha" label="Selling price (Taka)" />
        <ProductMoneyField name="compareAtPricePoisha" label="Old price (Taka)" />
        {simple ? (
          <ProductMoneyField name="variants.0.costPoisha" label="Your cost (Taka)" />
        ) : null}
      </div>
      <FormField name="description" label="Description">
        {(control) => (
          <Textarea
            {...control}
            {...form.register('description', {
              setValueAs: (value: string | null) => value?.trim() || null,
            })}
          />
        )}
      </FormField>
      <FormField name="aliases" label="Other names" hint="One name per line.">
        {(control) => (
          <Controller
            control={form.control}
            name="aliases"
            render={({ field }) => (
              <Textarea
                {...control}
                value={field.value?.join('\n') ?? ''}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(event.target.value.split('\n'))}
                ref={field.ref}
              />
            )}
          />
        )}
      </FormField>
      <div className="space-y-4">
        {(
          [
            ['isStockTracked', 'Track stock'],
            ['isVisibleInChats', 'Show in chat replies'],
            ['isVisibleInOrderLink', 'Show in the order link'],
          ] as const
        ).map(([name, label]) => (
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
