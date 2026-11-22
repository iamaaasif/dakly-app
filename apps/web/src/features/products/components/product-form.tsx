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

import { useAdjustStock } from '../api/adjust-stock';
import { useChangeProduct } from '../api/change-product';
import { useCreateProduct } from '../api/create-product';
import { ProductFields } from './product-fields';
import { ProductOptions } from './product-options';
import { takaInputFromPoisha } from '@/lib/format-money';

type ProductFormProps = {
  product?: ProductResponse;
  onSaved: (product: ProductResponse, failedSizes: string[]) => void;
  onCancel?: () => void;
};

export function ProductForm({ product, onSaved, onCancel }: ProductFormProps) {
  const form = useForm<ProductFormValues, undefined, ProductFormInput>({
    resolver: zodResolver(productFormSchema),
    defaultValues: formValues(product),
  });
  const create = useCreateProduct();
  const change = useChangeProduct(product?.id ?? '');
  const adjustStock = useAdjustStock();
  const mutation = product ? change : create;
  const { dirtyFields, errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit((parsed) => {
    const input = product ? parsed : shareCostAcrossSizes(parsed);
    const setError = (error: Error) =>
      form.setError(productErrorField(error, input.variants.length), {
        message: error.message,
      });
    if (product) {
      change.mutate(productChanges(input, dirtyFields), {
        onSuccess: (saved) => onSaved(saved, []),
        onError: setError,
      });
      return;
    }
    create.mutate(input, {
      onError: setError,
      onSuccess: async (saved) => {
        const failed = await saveInitialStocks({
          saved,
          input,
          formVariants: form.getValues('variants'),
          adjustStock: adjustStock.mutateAsync,
        });
        onSaved(saved, failed);
      },
    });
  });

  return (
    <FormProvider {...form}>
      <form className="space-y-3.5" onSubmit={onSubmit}>
        <ProductFields productId={product?.id} />
        <ProductOptions mode={product ? 'edit' : 'create'} />
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

// On a new product the cost field edits the first variant only, so sizes left without a cost use it.
function shareCostAcrossSizes(input: ProductFormInput): ProductFormInput {
  const cost = input.variants[0]?.costPoisha ?? null;
  if (cost === null) return input;
  return {
    ...input,
    variants: input.variants.map((variant) => ({
      ...variant,
      costPoisha: variant.costPoisha ?? cost,
    })),
  };
}

type SaveInitialStocksArgs = {
  saved: ProductResponse;
  input: ProductFormInput;
  formVariants: ProductFormValues['variants'];
  adjustStock: (args: {
    variantId: string;
    input: { quantity: number; reason: string };
  }) => Promise<unknown>;
};

async function saveInitialStocks({
  saved,
  input,
  formVariants,
  adjustStock,
}: SaveInitialStocksArgs): Promise<string[]> {
  const failed: string[] = [];
  const sizeOption = input.options[0]?.name ?? '';
  const adjustments = (formVariants ?? []).flatMap((variant, index) => {
    const quantity = variant.initialStock ?? 0;
    if (quantity <= 0) return [];
    const sizeName = input.options[0]?.values[index] ?? '';
    const variantId = saved.variants.find((v) => v.optionValues[sizeOption] === sizeName)?.id;
    if (!variantId) {
      failed.push(sizeName);
      return [];
    }
    return [{ sizeName, variantId, quantity }];
  });

  if (adjustments.length === 0) return failed;

  const results = await Promise.allSettled(
    adjustments.map((item) =>
      adjustStock({
        variantId: item.variantId,
        input: { quantity: item.quantity, reason: 'Initial stock' },
      }),
    ),
  );

  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      failed.push(adjustments[index]!.sizeName);
    }
  }

  return failed;
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
