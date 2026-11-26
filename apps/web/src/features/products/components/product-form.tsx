'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { FormProvider, useForm, type FormState, type UseFormReturn } from 'react-hook-form';

import type { AssistantProductDraft } from '@dakly/contracts/assistant';
import {
  createProductSchema,
  productFormSchema,
  type ChangeProductInput,
  type ProductFormInput,
  type ProductFormValues,
  type ProductResponse,
} from '@dakly/contracts/products';
import { ApiError } from '@dakly/ui/api-client';
import { Button, buttonVariants } from '@dakly/ui/button';

import { useAdjustStock } from '../api/adjust-stock';
import { useChangeProduct } from '../api/change-product';
import { useCreateProduct } from '../api/create-product';
import { assistantDraftValues } from '../product-assistant-draft';
import { hasStockEdits, stockChanges, writeStockChanges } from '../product-stock-changes';
import type { QuickAddHandoff } from '../quick-add-handoff';
import { useDraftCategory } from '../use-draft-category';
import { ProductFields } from './product-fields';
import { ProductFormPageLayout, type ProductFormPage } from './product-form-layout';
import { ProductOptions } from './product-options';
import { ProductStatusField } from './product-status-field';
import { StockReasonDialog } from './stock-reason-dialog';
import { takaInputFromPoisha } from '@/lib/format-money';

// The page enters regular and sell prices in this order. The API stores the price paid first.
const pageFormSchema = productFormSchema
  .superRefine(({ pricePoisha, compareAtPricePoisha }, context) => {
    if (compareAtPricePoisha !== null && compareAtPricePoisha >= pricePoisha)
      context.addIssue({
        code: 'custom',
        path: ['compareAtPricePoisha'],
        message: 'Enter a sell price below the regular price.',
      });
  })
  .transform((input) =>
    input.compareAtPricePoisha === null
      ? input
      : {
          ...input,
          pricePoisha: input.compareAtPricePoisha,
          compareAtPricePoisha: input.pricePoisha,
        },
  );

type ProductFormProps = {
  product?: ProductResponse;
  // Values typed in the quick add, used only for a new product.
  initial?: QuickAddHandoff;
  duplicateSource?: ProductResponse;
  // Details Ask Dakly AI filled in from the owner's prompt; nothing is saved until Save.
  assistantDraft?: AssistantProductDraft;
  onSaved: (product: ProductResponse, failedStock: string[]) => void;
  page?: ProductFormPage;
};

export function ProductForm(props: ProductFormProps) {
  const { product, assistantDraft, duplicateSource, onSaved, page } = props;
  const [editingOption, setEditingOption] = useState(false);
  const form = useForm<ProductFormValues, undefined, ProductFormInput>({
    resolver: zodResolver(page ? pageFormSchema : productFormSchema),
    defaultValues: {
      isVisibleInChats: true,
      isVisibleInOrderLink: true,
      ...formValues(props),
    },
  });
  const { dirtyFields, errors, isDirty } = form.formState;
  useDraftCategory(form, assistantDraft);
  const { onSubmit, dialog, isPending } = useSubmitProduct(form, {
    product,
    isDuplicate: Boolean(duplicateSource),
    dirtyFields,
    onSaved,
  });
  const actions = (
    <ProductFormActions
      isPending={isPending}
      editingOption={editingOption}
      isDirty={isDirty}
      invalidWeight={Boolean(errors.weightGrams)}
      product={product}
      cancelHref={page?.backHref}
    />
  );
  const serverError = errors.root?.server?.message;
  const errorMessage = serverError ? (
    <p role="alert" className="text-danger">
      {serverError}
    </p>
  ) : null;

  return (
    <FormProvider {...form}>
      <form className={page ? undefined : 'space-y-3.5'} onSubmit={onSubmit}>
        {page ? (
          <ProductFormPageLayout
            page={page}
            actions={actions}
            serverError={errorMessage}
            product={product}
            onOptionDraftChange={setEditingOption}
          />
        ) : (
          <ProductFormFields product={product}>
            {errorMessage}
            {actions}
          </ProductFormFields>
        )}
      </form>
      {dialog}
    </FormProvider>
  );
}

function ProductFormFields({
  product,
  children,
}: {
  product?: ProductResponse;
  children: ReactNode;
}) {
  return (
    <>
      <ProductFields productId={product?.id} />
      {product ? null : <ProductStatusField />}
      <ProductOptions mode={product ? 'edit' : 'create'} />
      {children}
    </>
  );
}

type SubmitProductArgs = {
  product?: ProductResponse;
  isDuplicate: boolean;
  dirtyFields: FormState<ProductFormValues>['dirtyFields'];
  onSaved: ProductFormProps['onSaved'];
};

function useSubmitProduct(
  form: UseFormReturn<ProductFormValues, undefined, ProductFormInput>,
  { product, isDuplicate, dirtyFields, onSaved }: SubmitProductArgs,
) {
  const create = useCreateProduct();
  const change = useChangeProduct(product?.id ?? '');
  const adjustStock = useAdjustStock();
  const [askReason, setAskReason] = useState(false);
  const reason = useRef<string | null>(null);
  const onSubmit = form.handleSubmit((parsed) => {
    const input = product || isDuplicate ? parsed : shareCostAcrossSizes(parsed);
    const values = form.getValues();
    if (product && reason.current === null && hasStockEdits(values, product)) {
      setAskReason(true);
      return;
    }
    const setError = (error: Error) =>
      form.setError(productErrorField(error, input.variants.length), {
        message: error.message,
      });
    const writeStock = async (saved: ProductResponse) => {
      const failed = await writeStockChanges(
        stockChanges(saved, values, product),
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
      void change.mutateAsync(productChanges(input, dirtyFields)).then(writeStock, setError);
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
  editingOption: boolean;
  isDirty: boolean;
  invalidWeight: boolean;
  product?: ProductResponse;
  cancelHref?: string;
};

function ProductFormActions({
  isPending,
  editingOption,
  isDirty,
  invalidWeight,
  product,
  cancelHref,
}: ProductFormActionsProps) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {cancelHref ? (
        <Link href={cancelHref} className={buttonVariants({ variant: 'secondary' })}>
          Cancel
        </Link>
      ) : null}
      <Button
        type="submit"
        loading={isPending}
        disabled={editingOption || invalidWeight || (Boolean(product) && !isDirty)}
      >
        {product ? 'Save' : 'Create'}
      </Button>
    </div>
  );
}

function formValues({
  product,
  initial,
  assistantDraft,
  duplicateSource,
  page,
}: Pick<
  ProductFormProps,
  'product' | 'initial' | 'assistantDraft' | 'duplicateSource' | 'page'
>): ProductFormValues {
  if (product) return sourceFormValues(product, Boolean(page), false);
  if (duplicateSource) return sourceFormValues(duplicateSource, Boolean(page), true);
  if (assistantDraft) return assistantDraftValues(assistantDraft);
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
}

function sourceFormValues(
  source: ProductResponse,
  onPage: boolean,
  isDuplicate: boolean,
): ProductFormValues {
  return {
    name: isDuplicate ? copyName(source.name) : source.name,
    description: source.description,
    categoryId: source.categoryId,
    brandId: source.brandId,
    weightGrams: weightText(source.weightGrams),
    aliases: source.aliases,
    options: source.options,
    ...priceFields(source, onPage),
    variants: source.variants.map(
      ({ id, optionValues, sku, priceOverridePoisha, costPoisha, lowStockThreshold, onHand }) => ({
        id: isDuplicate ? undefined : id,
        optionValues: Object.fromEntries(
          source.options.map(({ name }, index) => [index, optionValues[name]!]),
        ),
        // Each product code is unique within the shop.
        sku: isDuplicate ? null : sku,
        priceOverridePoisha: takaInputFromPoisha(priceOverridePoisha),
        costPoisha: takaInputFromPoisha(costPoisha),
        lowStockThreshold: lowStockThreshold === null ? '' : String(lowStockThreshold),
        initialStock: isDuplicate ? 0 : onHand,
      }),
    ),
    isStockTracked: source.isStockTracked,
    isVisibleInChats: source.isVisibleInChats,
    isVisibleInOrderLink: source.isVisibleInOrderLink,
    status: isDuplicate ? 'hidden' : undefined,
  };
}

function copyName(name: string) {
  const suffix = ' copy';
  const limit = createProductSchema.shape.name.maxLength;
  const stem = limit === null ? name : name.slice(0, limit - suffix.length).trimEnd();
  return `${stem}${suffix}`;
}

function priceFields(product: ProductResponse, onPage: boolean) {
  const price = product.pricePoisha;
  const oldPrice = product.compareAtPricePoisha;
  if (onPage && oldPrice !== null && oldPrice > price)
    return {
      pricePoisha: takaInputFromPoisha(oldPrice),
      compareAtPricePoisha: takaInputFromPoisha(price),
    };
  return {
    pricePoisha: takaInputFromPoisha(price),
    compareAtPricePoisha: takaInputFromPoisha(onPage ? null : oldPrice),
  };
}

function weightText(grams: number | null) {
  return grams === null ? '' : String(grams);
}

function productChanges(
  { status: _status, options, variants, ...fields }: ProductFormInput,
  dirty: FormState<ProductFormValues>['dirtyFields'],
): ChangeProductInput {
  const changes = Object.fromEntries(
    Object.entries(fields).filter(([name]) => dirty[name as keyof typeof fields]),
  );
  const prices =
    dirty.pricePoisha || dirty.compareAtPricePoisha
      ? { pricePoisha: fields.pricePoisha, compareAtPricePoisha: fields.compareAtPricePoisha }
      : {};
  return dirty.options || dirty.variants
    ? { ...changes, ...prices, options, variants }
    : { ...changes, ...prices };
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
