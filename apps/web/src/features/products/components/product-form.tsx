'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { FormProvider, useForm, type FormState, type UseFormReturn } from 'react-hook-form';

import type { AssistantProductDraft } from '@dakly/contracts/assistant';
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
import { assistantDraftValues } from '../product-assistant-draft';
import { hasStockEdits, stockChanges, writeStockChanges } from '../product-stock-changes';
import type { QuickAddHandoff } from '../quick-add-handoff';
import {
  ProductDescriptionFields,
  ProductFields,
  ProductNameFields,
  ProductPriceFields,
  ProductStockFields,
} from './product-fields';
import { ProductOptions } from './product-options';
import { ProductVariantsCard } from './product-variants-card';
import { StockReasonDialog } from './stock-reason-dialog';
import { takaInputFromPoisha } from '@/lib/format-money';

// The full page keeps Save in a top bar that stays in view and puts photos and status beside the fields.
type ProductFormPage = {
  title: string;
  backHref: string;
  photos: ReactNode;
  status: ReactNode;
  notice?: ReactNode;
};

type ProductFormProps = {
  product?: ProductResponse;
  // Values typed in the quick add, used only for a new product.
  initial?: QuickAddHandoff;
  // Details Ask Dakly AI filled in from the owner's prompt; nothing is saved until Save.
  assistantDraft?: AssistantProductDraft;
  onSaved: (product: ProductResponse, failedStock: string[]) => void;
  onCancel?: () => void;
  page?: ProductFormPage;
};

export function ProductForm({
  product,
  initial,
  assistantDraft,
  onSaved,
  onCancel,
  page,
}: ProductFormProps) {
  const form = useForm<ProductFormValues, undefined, ProductFormInput>({
    resolver: zodResolver(productFormSchema),
    defaultValues: formValues(product, initial, assistantDraft),
  });
  const { dirtyFields, errors, isDirty } = form.formState;
  const { onSubmit, dialog, isPending } = useSubmitProduct(form, {
    product,
    dirtyFields,
    onSaved,
  });
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
            product={product}
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
      {dialog}
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
  const [askReason, setAskReason] = useState(false);
  const reason = useRef<string | null>(null);
  const onSubmit = form.handleSubmit((parsed) => {
    const input = product ? parsed : shareCostAcrossSizes(parsed);
    if (product && reason.current === null && hasStockEdits(form.getValues(), product)) {
      setAskReason(true);
      return;
    }
    const setError = (error: Error) =>
      form.setError(productErrorField(error, input.variants.length), {
        message: error.message,
      });
    const writeStock = async (saved: ProductResponse) => {
      const failed = await writeStockChanges(
        stockChanges(saved, form.getValues(), product),
        reason.current ?? 'Initial stock',
        adjustStock.mutateAsync,
      );
      reason.current = null;
      if (failed.length)
        form.setError('root.server', {
          message: `Saved, but the stock for ${failed.join(', ')} could not be updated. Use Restock on the list.`,
        });
      onSaved(saved, failed);
    };
    if (product) {
      change.mutate(productChanges(input, dirtyFields), {
        onSuccess: writeStock,
        onError: setError,
      });
      return;
    }
    create.mutate(input, { onError: setError, onSuccess: writeStock });
  });
  const dialog = askReason ? (
    <StockReasonDialog
      onCancel={() => setAskReason(false)}
      onConfirm={(text) => {
        reason.current = text;
        setAskReason(false);
        void onSubmit();
      }}
    />
  ) : null;
  return { onSubmit, dialog, isPending: (product ? change : create).isPending };
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
  product?: ProductResponse;
  productId?: string;
  actions: ReactNode;
  serverError: ReactNode;
};

function ProductFormPageLayout({
  page,
  product,
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
        {/* On a phone the save buttons sit in a bar at the bottom so the title keeps its room. */}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background px-4 py-3 md:static md:z-auto md:border-0 md:bg-transparent md:p-0">
          {actions}
        </div>
      </div>
      <div className="grid gap-6 px-4 pt-6 pb-24 md:px-8 md:pb-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {page.notice}
          <Card>{page.photos}</Card>
          <FieldCard title="Basics">
            <ProductNameFields productId={productId} showCode={false} />
            <ProductDescriptionFields productId={productId} />
          </FieldCard>
          <FieldCard title="Price">
            <ProductPriceFields productId={productId} />
          </FieldCard>
          <Card>
            <ProductVariantsCard product={product} />
          </Card>
          <FieldCard title="Stock settings">
            <ProductStockFields productId={productId} withWarnAt />
          </FieldCard>
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

function formValues(
  product?: ProductResponse,
  initial?: QuickAddHandoff,
  assistantDraft?: AssistantProductDraft,
): ProductFormValues {
  if (!product && assistantDraft) return assistantDraftValues(assistantDraft);
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
          lowStockThreshold: '',
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
      ({ id, optionValues, sku, priceOverridePoisha, costPoisha, lowStockThreshold, onHand }) => ({
        id,
        optionValues: Object.fromEntries(
          product.options.map(({ name }, index) => [index, optionValues[name]!]),
        ),
        sku,
        priceOverridePoisha: takaInputFromPoisha(priceOverridePoisha),
        costPoisha: takaInputFromPoisha(costPoisha),
        lowStockThreshold: lowStockThreshold === null ? '' : String(lowStockThreshold),
        initialStock: onHand,
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
  if (error instanceof ApiError && error.code === 'PRODUCT_VARIANT_IN_OPEN_ORDERS')
    return 'variants';
  if (!(error instanceof ApiError) || error.code !== 'PRODUCT_SKU_TAKEN') return 'root.server';
  return variantCount === 1 ? 'variants.0.sku' : 'variants';
}
