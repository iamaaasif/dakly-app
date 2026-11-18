'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';

import {
  productFormSchema,
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
    defaultValues: {
      name: product?.name ?? '',
      description: product?.description ?? null,
      category: product?.category ?? null,
      aliases: product?.aliases ?? [],
      pricePoisha: taka(product?.pricePoisha ?? 0),
      compareAtPricePoisha: taka(product?.compareAtPricePoisha ?? null),
      options: product?.options ?? [],
      variants: (
        product?.variants ?? [
          {
            id: undefined,
            optionValues: {},
            sku: null,
            priceOverridePoisha: null,
            costPoisha: null,
          },
        ]
      ).map((variant) => ({
        id: variant.id,
        optionValues: variant.optionValues,
        sku: variant.sku,
        priceOverridePoisha: taka(variant.priceOverridePoisha),
        costPoisha: taka(variant.costPoisha),
      })),
      isStockTracked: product?.isStockTracked ?? true,
      isVisibleInChats: product?.isVisibleInChats ?? true,
      isVisibleInOrderLink: product?.isVisibleInOrderLink ?? true,
      status: product?.status ?? 'hidden',
    },
  });
  const create = useCreateProduct();
  const change = useChangeProduct(product?.id ?? '');
  const mutation = product ? change : create;
  return (
    <FormProvider {...form}>
      <form
        className="space-y-6"
        onSubmit={form.handleSubmit((input) =>
          mutation.mutate(input, {
            onSuccess: (saved) => onSaved(saved),
            onError: (error) =>
              form.setError(
                error instanceof ApiError && error.code === 'PRODUCT_SKU_TAKEN'
                  ? 'variants'
                  : 'root.server',
                { message: error.message },
              ),
          }),
        )}
      >
        <ProductFields />
        <ProductOptions />
        {form.formState.errors.root?.server ? (
          <p role="alert" className="text-danger">
            {form.formState.errors.root.server.message}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {product ? (
            <Button type="submit" loading={mutation.isPending}>
              Save product
            </Button>
          ) : (
            <>
              <Button
                type="submit"
                variant="secondary"
                loading={mutation.isPending}
                onClick={() => form.setValue('status', 'hidden')}
              >
                Save as hidden
              </Button>
              <Button
                type="submit"
                loading={mutation.isPending}
                onClick={() => form.setValue('status', 'active')}
              >
                Save and show
              </Button>
            </>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
function taka(value: number | null) {
  return value === null
    ? ''
    : `${BigInt(value) / 100n}.${(BigInt(value) % 100n).toString().padStart(2, '0')}`;
}
