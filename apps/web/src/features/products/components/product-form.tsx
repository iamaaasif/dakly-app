'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
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

import { useAdjustStock } from '../api/adjust-stock';
import { useChangeProduct } from '../api/change-product';
import { useCreateProduct } from '../api/create-product';
import { ProductFields } from './product-fields';
import { ProductOptions } from './product-options';
import { takaInputFromPoisha } from '@/lib/format-money';

type ProductFormProps = {
  product?: ProductResponse;
  onSaved: (product: ProductResponse) => void;
  onCancel?: () => void;
};

export function ProductForm({ product, onSaved, onCancel }: ProductFormProps) {
  const [stocks, setStocks] = useState<Record<number, number>>({});
  const resolver = zodResolver(productFormSchema);
  const form = useForm<ProductFormValues, undefined, ProductFormInput>({
    resolver: (values, context, options) => resolver(parseFormValues(values), context, options),
    defaultValues: formValues(product),
  });
  const create = useCreateProduct();
  const change = useChangeProduct(product?.id ?? '');
  const adjust = useAdjustStock();
  const mutation = product ? change : create;
  const { dirtyFields, errors, isDirty } = form.formState;

  return (
    <FormProvider {...form}>
      <form
        className="space-y-3.5"
        onSubmit={form.handleSubmit((input) => {
          const callbacks = {
            onSuccess: async (saved: ProductResponse) => {
              if (!product) await applyInitialStocks(saved, stocks, adjust.mutateAsync);
              onSaved(saved);
            },
            onError: (error: Error) =>
              form.setError(productErrorField(error, input.variants.length), {
                message: error.message,
              }),
          };
          if (product) change.mutate(productChanges(input, dirtyFields), callbacks);
          else create.mutate(withDefaultCost(input), callbacks);
        })}
      >
        <ProductFields productId={product?.id} />
        <ProductOptions
          mode={product ? 'edit' : 'create'}
          sizeStocks={stocks}
          onStockChange={(i, qty) => setStocks((prev) => ({ ...prev, [i]: qty }))}
        />
        {errors.root?.server?.message ? (
          <p role="alert" className="text-danger">
            {errors.root.server.message}
          </p>
        ) : null}
        <ProductFormActions
          isPending={mutation.isPending}
          canSave={!product || isDirty}
          product={product}
          onCancel={onCancel}
          onSetStatus={(status) => form.setValue('status', status)}
        />
      </form>
    </FormProvider>
  );
}

type ProductFormActionsProps = {
  isPending: boolean;
  canSave: boolean;
  product?: ProductResponse;
  onCancel?: () => void;
  onSetStatus: (status: 'active' | 'hidden') => void;
};

function ProductFormActions({
  isPending,
  canSave,
  product,
  onCancel,
  onSetStatus,
}: ProductFormActionsProps) {
  const actions = product
    ? [{ label: 'Save product', variant: 'primary' as const }]
    : [
        { status: 'hidden' as const, label: 'Save as hidden', variant: 'secondary' as const },
        { status: 'active' as const, label: 'Save and show', variant: 'primary' as const },
      ];

  return (
    <div className="flex flex-wrap justify-end gap-2 pt-2">
      {onCancel ? (
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
      {actions.map((action) => (
        <Button
          key={action.label}
          type="submit"
          variant={action.variant}
          loading={isPending}
          disabled={!canSave}
          onClick={() => 'status' in action && onSetStatus(action.status)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}

function formValues(product?: ProductResponse): ProductFormValues {
  if (!product)
    return {
      name: '',
      options: [],
      pricePoisha: '',
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

function parseFormValues(values: ProductFormValues) {
  if (values.pricePoisha !== '') return values;
  const copy: Record<string, unknown> = { ...values };
  delete copy.pricePoisha;
  return copy as ProductFormValues;
}

function withDefaultCost(input: ProductFormInput): ProductFormInput {
  const baseCost = input.variants[0]?.costPoisha;
  if (!baseCost) return input;
  return {
    ...input,
    variants: input.variants.map((v) => ({ ...v, costPoisha: v.costPoisha || baseCost })),
  };
}

async function applyInitialStocks(
  product: ProductResponse,
  stocks: Record<number, number>,
  adjustStock: (vars: {
    variantId: string;
    input: { quantity: number; reason: string };
  }) => Promise<unknown>,
) {
  const adjustments = product.variants
    .map((variant, index) => {
      const quantity = stocks[index] ?? 0;
      if (quantity <= 0) return null;
      return adjustStock({ variantId: variant.id, input: { quantity, reason: 'Initial stock' } });
    })
    .filter(Boolean);
  if (adjustments.length > 0) await Promise.allSettled(adjustments);
}
