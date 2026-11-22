'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FormProvider, useForm, type FormState, type UseFormReturn } from 'react-hook-form';

import {
  productFormSchema,
  type ChangeProductInput,
  type ProductFormInput,
  type ProductFormValues,
  type ProductResponse,
} from '@dakly/contracts/products';
import { ApiError } from '@dakly/ui/api-client';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';

import { useAdjustStock } from '../api/adjust-stock';
import { useChangeProduct } from '../api/change-product';
import { useCreateProduct } from '../api/create-product';
import type { QuickAddHandoff } from '../quick-add-handoff';
import {
  ProductDescriptionFields,
  ProductFields,
  ProductNameFields,
  ProductPriceFields,
  ProductStockFields,
} from './product-fields';
import { ProductOptions } from './product-options';
import { ProductPlainStock } from './product-plain-stock';
import { takaInputFromPoisha } from '@/lib/format-money';

// The full page keeps Save in a top bar that stays in view and puts photos and status beside the fields.
type ProductFormPage = { title: string; backHref: string; photos: ReactNode; status: ReactNode };

type ProductFormProps = {
  product?: ProductResponse;
  // Values typed in the quick add, used only for a new product.
  initial?: QuickAddHandoff;
  onSaved: (product: ProductResponse, failedSizes: string[]) => void;
  onCancel?: () => void;
  page?: ProductFormPage;
};

export function ProductForm({ product, initial, onSaved, onCancel, page }: ProductFormProps) {
  const form = useForm<ProductFormValues, undefined, ProductFormInput>({
    resolver: zodResolver(productFormSchema),
    defaultValues: formValues(product, initial),
  });
  const { dirtyFields, errors, isDirty } = form.formState;
  const { onSubmit, isPending } = useSubmitProduct(form, { product, dirtyFields, onSaved });
  const actions = (
    <ProductFormActions
      isPending={isPending}
      canSave={!product || isDirty}
      product={product}
      onCancel={onCancel}
      onSetStatus={(status) => form.setValue('status', status)}
    />
  );
  const serverError = errors.root?.server?.message ? (
    <p role="alert" className="text-danger">
      {errors.root.server.message}
    </p>
  ) : null;

  return (
    <FormProvider {...form}>
      <form className={page ? undefined : 'space-y-3.5'} onSubmit={onSubmit}>
        {page ? (
          <ProductFormPageLayout
            page={page}
            productId={product?.id}
            actions={actions}
            serverError={serverError}
          />
        ) : (
          <>
            <ProductFields productId={product?.id} />
            <ProductOptions mode={product ? 'edit' : 'create'} />
            {serverError}
            {actions}
          </>
        )}
      </form>
    </FormProvider>
  );
}

type SubmitProductArgs = {
  product?: ProductResponse;
  dirtyFields: FormState<ProductFormValues>['dirtyFields'];
  onSaved: ProductFormProps['onSaved'];
};

function useSubmitProduct(
  form: UseFormReturn<ProductFormValues, undefined, ProductFormInput>,
  { product, dirtyFields, onSaved }: SubmitProductArgs,
) {
  const create = useCreateProduct();
  const change = useChangeProduct(product?.id ?? '');
  const adjustStock = useAdjustStock();
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
  return { onSubmit, isPending: (product ? change : create).isPending };
}

function FieldCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-3.5">
      <h2 className="text-base font-semibold text-text">{title}</h2>
      {children}
    </Card>
  );
}

type ProductFormPageLayoutProps = {
  page: ProductFormPage;
  productId?: string;
  actions: ReactNode;
  serverError: ReactNode;
};

function ProductFormPageLayout({
  page,
  productId,
  actions,
  serverError,
}: ProductFormPageLayoutProps) {
  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3 md:px-8">
        <Link href={page.backHref} aria-label="Back to products" className="text-text-muted">
          ←
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-text">{page.title}</h1>
        {actions}
      </div>
      <div className="grid gap-6 px-4 py-6 md:px-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Card>{page.photos}</Card>
          <FieldCard title="Basics">
            <ProductNameFields productId={productId} />
            <ProductDescriptionFields productId={productId} />
          </FieldCard>
          <FieldCard title="Price">
            <ProductPriceFields productId={productId} />
          </FieldCard>
          <FieldCard title="Stock">
            <ProductStockFields productId={productId} />
            {productId ? null : <ProductPlainStock />}
          </FieldCard>
          <Card>
            <ProductOptions mode={productId ? 'edit' : 'create'} />
          </Card>
          {serverError}
        </div>
        <div className="space-y-4">{page.status}</div>
      </div>
    </>
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
    const variantId = sizeOption
      ? saved.variants.find((v) => v.optionValues[sizeOption] === sizeName)?.id
      : saved.variants[0]?.id;
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

function formValues(product?: ProductResponse, initial?: QuickAddHandoff): ProductFormValues {
  if (!product)
    return {
      name: initial?.name ?? '',
      options: [],
      pricePoisha: initial?.price ?? '',
      variants: [
        {
          optionValues: {},
          sku: null,
          priceOverridePoisha: '',
          costPoisha: '',
          initialStock: Number(initial?.stock || 0),
        },
      ],
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
