'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm, type FormState } from 'react-hook-form';

import {
  productFormSchema,
  type ChangeProductInput,
  type ProductFormInput,
  type ProductFormValues,
  type ProductResponse,
} from '@dakly/contracts/products';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';

import { useChangeProduct } from '../api/change-product';
import { useCreateProduct } from '../api/create-product';
import { ProductFields } from './product-fields';
import { ProductOptions } from './product-options';

type ProductFormProps = { product?: ProductResponse; onSaved: (product: ProductResponse) => void };
export function ProductForm({ product, onSaved }: ProductFormProps) {
  const form = useForm<ProductFormValues, undefined, ProductFormInput>({
    resolver: zodResolver(productFormSchema),
    defaultValues: formValues(product),
  });
  const create = useCreateProduct();
  const change = useChangeProduct(product?.id ?? '');
  const mutation = product ? change : create;
  const { dirtyFields, errors, isDirty } = form.formState;
  const actions = product
    ? [{ label: 'Save product', variant: 'primary' as const }]
    : [
        { status: 'hidden' as const, label: 'Save as hidden', variant: 'secondary' as const },
        { status: 'active' as const, label: 'Save and show', variant: 'primary' as const },
      ];
  return (
    <FormProvider {...form}>
      <form
        className="space-y-6"
        onSubmit={form.handleSubmit((input) => {
          const callbacks = {
            onSuccess: (saved: ProductResponse) => onSaved(saved),
            onError: (error: Error) =>
              form.setError(productErrorField(error, input.variants.length), {
                message: error.message,
              }),
          };
          if (product) change.mutate(productChanges(input, dirtyFields), callbacks);
          else create.mutate(input, callbacks);
        })}
      >
        <ProductFields mode={product ? 'edit' : 'create'} />
        <ProductOptions />
        {errors.root?.server?.message ? (
          <p role="alert" className="text-danger">
            {errors.root.server.message}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              type="submit"
              variant={action.variant}
              loading={mutation.isPending}
              disabled={Boolean(product && !isDirty)}
              onClick={() => 'status' in action && form.setValue('status', action.status)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </form>
    </FormProvider>
  );
}
function takaInputFromPoisha(value: number | null) {
  if (value === null) return '';
  const amount = BigInt(value);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, '0')}`;
}

function formValues(product?: ProductResponse): ProductFormValues {
  if (!product)
    return {
      name: '',
      options: [],
      pricePoisha: '0.00',
      variants: [{ optionValues: {}, sku: null, priceOverridePoisha: '', costPoisha: '' }],
      isStockTracked: true,
      status: 'hidden',
    };
  return {
    name: product.name,
    description: product.description,
    category: product.category,
    aliases: product.aliases,
    options: product.options,
    pricePoisha: takaInputFromPoisha(product.pricePoisha),
    compareAtPricePoisha: takaInputFromPoisha(product.compareAtPricePoisha),
    variants: product.variants.map(
      ({ id, optionValues, sku, priceOverridePoisha, costPoisha }) => ({
        id,
        optionValues: Object.fromEntries(
          product.options.map(({ name }, index) => [index, optionValues[name]!]),
        ),
        sku,
        priceOverridePoisha: takaInputFromPoisha(priceOverridePoisha),
        costPoisha: takaInputFromPoisha(costPoisha),
      }),
    ),
    isStockTracked: product.isStockTracked,
    isVisibleInChats: product.isVisibleInChats,
    isVisibleInOrderLink: product.isVisibleInOrderLink,
    status: product.status,
  };
}

function productChanges(
  { status: _status, options, variants, ...fields }: ProductFormInput,
  dirty: FormState<ProductFormValues>['dirtyFields'],
): ChangeProductInput {
  const changes = Object.fromEntries(
    Object.entries(fields).filter(([name]) => dirty[name as keyof typeof fields]),
  );
  return dirty.options || dirty.variants ? { ...changes, options, variants } : changes;
}

function productErrorField(
  error: Error,
  variantCount: number,
): 'root.server' | 'variants' | 'variants.0.sku' {
  if (!(error instanceof ApiError) || error.code !== 'PRODUCT_SKU_TAKEN') return 'root.server';
  return variantCount === 1 ? 'variants.0.sku' : 'variants';
}
