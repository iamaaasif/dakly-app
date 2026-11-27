'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { FormProvider, useForm, type FormState, type UseFormReturn } from 'react-hook-form';

import type { AssistantProductDraft } from '@dakly/contracts/assistant';
import {
  productFormSchema,
  productNegotiationIssue,
  productNegotiationIssues,
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
import { formValues } from '../product-form-values';
import { hasStockEdits, stockChanges, writeStockChanges } from '../product-stock-changes';
import type { QuickAddHandoff } from '../quick-add-handoff';
import { useDraftCategory } from '../use-draft-category';
import { ProductFields } from './product-fields';
import {
  ProductFormPageLayout,
  ProductSaveError,
  type ProductFormPage,
} from './product-form-layout';
import { ProductFormSafety } from './product-form-safety';
import { ProductOptions } from './product-options';
import { ProductStatusField } from './product-status-field';
import { StockReasonDialog } from './stock-reason-dialog';

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
  )
  .superRefine((input, context) => {
    const code = productNegotiationIssue(input);
    if (code) {
      const { field, message } = productNegotiationIssues[code];
      context.addIssue({ code: 'custom', path: [field], message });
    }
  });

type ProductFormProps = {
  product?: ProductResponse;
  // Values typed in the quick add, used only for a new product.
  initial?: QuickAddHandoff;
  duplicateSource?: ProductResponse;
  // Details Ask Dakly AI filled in from the owner's prompt; nothing is saved until Save.
  assistantDraft?: AssistantProductDraft;
  onSaved: (product: ProductResponse, failedStock: string[]) => void;
  page?: ProductFormPage;
  expectedVersion?: number;
  statusConflict?: ApiError;
  onReload?: () => void;
  // Photos uploaded before the product exists; Create attaches them.
  photos?: { fileIds: string[]; uploading: number; failed: number };
};

export function ProductForm(props: ProductFormProps) {
  const { product, assistantDraft, duplicateSource, onSaved, page } = props;
  const [editingOption, setEditingOption] = useState(false);
  const [formProduct] = useState(product);
  const formRef = useRef<HTMLFormElement>(null);
  const form = useForm<ProductFormValues, undefined, ProductFormInput>({
    resolver: zodResolver(page ? pageFormSchema : productFormSchema),
    defaultValues: {
      isVisibleInChats: true,
      isVisibleInOrderLink: true,
      negotiationEnabled: false,
      negotiationOpeningPoisha: '',
      negotiationFloorPoisha: '',
      ...formValues({ ...props, product: formProduct }),
    },
  });
  const { dirtyFields, errors, isDirty } = form.formState;
  useDraftCategory(form, assistantDraft);
  const { onSubmit, dialog, isPending } = useSubmitProduct(form, {
    product: formProduct,
    isDuplicate: Boolean(duplicateSource),
    dirtyFields,
    expectedVersion: props.expectedVersion,
    photos: props.photos,
    onSaved,
  });
  const actions = (
    <ProductFormActions
      isPending={isPending}
      editingOption={editingOption}
      isDirty={isDirty}
      invalidWeight={Boolean(errors.weightGrams)}
      uploading={props.photos?.uploading ?? 0}
      product={product}
      cancelHref={page?.backHref}
    />
  );
  const error = errors.root?.server;
  return (
    <FormProvider {...form}>
      <form ref={formRef} className={page ? undefined : 'space-y-3.5'} onSubmit={onSubmit}>
        <ProductFormView
          {...props}
          formRef={formRef}
          actions={actions}
          error={props.statusConflict ?? error}
          onOptionDraftChange={setEditingOption}
        />
      </form>
      {dialog}
    </FormProvider>
  );
}

type ProductFormViewProps = ProductFormProps & {
  formRef: RefObject<HTMLFormElement | null>;
  actions: ReactNode;
  error: Error | { type?: string | number; message?: string } | undefined;
  onOptionDraftChange: (editing: boolean) => void;
};

function ProductFormView(props: ProductFormViewProps) {
  const { page, product, actions, error, formRef } = props;
  if (!page)
    return (
      <ProductFormFields product={product}>
        <ProductSaveError error={error} />
        {actions}
      </ProductFormFields>
    );
  const canRestoreDraft =
    !product && !props.duplicateSource && !props.assistantDraft && !props.initial?.name;
  return (
    <>
      <ProductFormSafety
        formRef={formRef}
        readOnly={page.readOnly}
        canRestoreDraft={canRestoreDraft}
      />
      <ProductFormPageLayout
        page={page}
        actions={actions}
        saveError={{ error, onReload: props.onReload }}
        product={product}
        onOptionDraftChange={props.onOptionDraftChange}
      />
    </>
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
  expectedVersion?: number;
  photos?: ProductFormProps['photos'];
  onSaved: ProductFormProps['onSaved'];
};

function useSubmitProduct(
  form: UseFormReturn<ProductFormValues, undefined, ProductFormInput>,
  { product, isDuplicate, dirtyFields, expectedVersion, photos, onSaved }: SubmitProductArgs,
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
        ...(error instanceof ApiError ? { type: error.code } : {}),
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
      void change
        .mutateAsync({ ...productChanges(input, dirtyFields), expectedVersion })
        .then(writeStock, setError);
      return;
    }
    if (photos?.failed) return failedPhotoError(form);
    create.mutate(
      { ...input, imageFileIds: photos?.fileIds },
      { onError: setError, onSuccess: writeStock },
    );
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

function failedPhotoError(form: UseFormReturn<ProductFormValues, undefined, ProductFormInput>) {
  form.setError('root.server', {
    message: 'A photo did not upload. Retry or remove it, then create the product.',
  });
}

function uploadingLabel(count: number) {
  return `Uploading ${count} ${count === 1 ? 'photo' : 'photos'}…`;
}

type ProductFormActionsProps = {
  isPending: boolean;
  editingOption: boolean;
  isDirty: boolean;
  invalidWeight: boolean;
  uploading: number;
  product?: ProductResponse;
  cancelHref?: string;
};

function ProductFormActions({
  isPending,
  editingOption,
  isDirty,
  invalidWeight,
  uploading,
  product,
  cancelHref,
}: ProductFormActionsProps) {
  const saveLabel = product ? 'Save' : 'Create';
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
        disabled={editingOption || invalidWeight || uploading > 0 || (Boolean(product) && !isDirty)}
      >
        {uploading > 0 ? uploadingLabel(uploading) : saveLabel}
      </Button>
    </div>
  );
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

function productErrorField(error: Error, variantCount: number) {
  if (!(error instanceof ApiError)) return 'root.server';
  if (Object.hasOwn(productNegotiationIssues, error.code))
    return productNegotiationIssues[error.code as keyof typeof productNegotiationIssues].field;
  if (error.code === 'PRODUCT_VARIANT_IN_OPEN_ORDERS') return 'variants';
  if (error.code === 'PRODUCT_SKU_TAKEN') return variantCount === 1 ? 'variants.0.sku' : 'variants';
  return 'root.server';
}
