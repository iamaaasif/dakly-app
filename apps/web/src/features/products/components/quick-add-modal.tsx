'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import {
  productFormSchema,
  type ProductFormInput,
  type ProductFormValues,
} from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Label } from '@dakly/ui/label';

import { useQuickAddProduct } from '../api/quick-add-product';
import { quickAddHandoffHref } from '../quick-add-handoff';
import { ProductInputField } from './product-input-field';
import { ProductPlainStock } from './product-plain-stock';
import { SessionDialog } from '@/components/session-dialog';

const photoTypes = 'image/jpeg,image/png,image/webp';

type Partial = { productId: string; message: string };

export function QuickAddModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { form, state, save, openFullPage } = useQuickAdd(onClose);
  const { quickAdd, photo, setPhoto, preview, partial, openAfterSave } = state;
  return (
    <SessionDialog
      title="Add product"
      open
      closeDisabled={quickAdd.isPending}
      onClose={onClose}
      className="max-sm:h-dvh max-sm:max-w-none max-sm:flex-col max-sm:rounded-none max-sm:border-0 max-sm:p-4 max-sm:open:flex sm:max-w-[420px]"
    >
      <FormProvider {...form}>
        <form
          onSubmit={(event) => {
            openAfterSave.current = false;
            return save(event);
          }}
          className="flex flex-1 flex-col gap-4"
        >
          <ProductInputField name="name" label="Name" placeholder="e.g. Cotton Panjabi" autoFocus />
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
            <ProductInputField name="pricePoisha" label="Selling price ৳" />
            <ProductPlainStock />
          </div>
          <PhotoBox preview={preview} onFile={setPhoto} photo={photo} />
          <p className="text-sm text-text-muted">
            Saved as hidden. Add sizes, cost and description on the next page.
          </p>
          {partial ? (
            <p role="alert" className="text-danger">
              {partial.message}{' '}
              <Button
                variant="link"
                className="min-h-0 py-0"
                onClick={() => router.push(`/products/${partial.productId}`)}
              >
                Open product
              </Button>
            </p>
          ) : null}
          {quickAdd.error ? (
            <p role="alert" className="text-danger">
              {quickAdd.error.message}
            </p>
          ) : null}
          <QuickAddFooter
            pending={quickAdd.isPending}
            saving={quickAdd.isPending && !openAfterSave.current}
            onMoreDetails={openFullPage}
            onCancel={onClose}
          />
        </form>
      </FormProvider>
    </SessionDialog>
  );
}

type QuickAddFooterProps = {
  pending: boolean;
  saving: boolean;
  onMoreDetails: () => void;
  onCancel: () => void;
};

function QuickAddFooter({ pending, saving, onMoreDetails, onCancel }: QuickAddFooterProps) {
  return (
    <div className="max-sm:contents sm:flex sm:items-center sm:justify-between">
      <Button
        variant="link"
        disabled={pending}
        onClick={onMoreDetails}
        className="max-sm:self-start"
      >
        More details →
      </Button>
      <div className="flex gap-2 max-sm:-mx-4 max-sm:mt-auto max-sm:grid max-sm:grid-cols-2 max-sm:border-t max-sm:border-border max-sm:px-4 max-sm:pt-3">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Save product
        </Button>
      </div>
    </div>
  );
}

function useQuickAdd(onClose: () => void) {
  const router = useRouter();
  const quickAdd = useQuickAddProduct();
  const form = useForm<ProductFormValues, undefined, ProductFormInput>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: '',
      pricePoisha: '',
      options: [],
      variants: [{ optionValues: {}, sku: null, priceOverridePoisha: '', costPoisha: '' }],
      isStockTracked: true,
      status: 'hidden',
    },
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const preview = usePhotoPreview(photo);
  const openAfterSave = useRef(false);
  const [partial, setPartial] = useState<Partial | null>(null);

  const save = form.handleSubmit(({ status: _status, variants, ...product }) => {
    const stock = form.getValues('variants.0.initialStock') ?? 0;
    quickAdd.mutate(
      { product: { ...product, status: 'hidden', variants }, stock, photo },
      {
        onSuccess: ({ product: saved, failed }) => {
          if (openAfterSave.current) return router.push(`/products/${saved.id}`);
          if (failed.length === 0) return onClose();
          const what = failed.map((item) => (item === 'photo' ? 'the photo' : 'the stock'));
          setPartial({
            productId: saved.id,
            message: `Saved as hidden, but ${what.join(' and ')} could not be saved. Add it on the product page.`,
          });
        },
      },
    );
  });

  // A chosen photo cannot travel in the address, so that case saves first and opens the saved product.
  function openFullPage() {
    if (photo) {
      openAfterSave.current = true;
      return void save();
    }
    router.push(
      quickAddHandoffHref({
        name: form.getValues('name'),
        price: form.getValues('pricePoisha') ?? '',
        stock: String(form.getValues('variants.0.initialStock') ?? ''),
      }),
    );
  }

  return {
    form,
    save,
    openFullPage,
    state: { quickAdd, photo, setPhoto, preview, partial, openAfterSave },
  };
}

type PhotoBoxProps = { preview: string | null; photo: File | null; onFile: (file: File) => void };

function PhotoBox({ preview, photo, onFile }: PhotoBoxProps) {
  const id = useId();
  return (
    <div className="max-sm:order-first">
      <Label
        htmlFor={id}
        className="relative flex h-[90px] cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-input-border bg-surface-muted text-xs text-text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus hover:border-text max-sm:h-32"
      >
        {preview ? (
          <Image
            src={preview}
            alt={photo?.name ?? 'Chosen photo'}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          'Add a photo'
        )}
        <input
          id={id}
          type="file"
          aria-label="Add photo"
          accept={photoTypes}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = '';
          }}
        />
      </Label>
    </div>
  );
}

function usePhotoPreview(photo: File | null) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  return preview;
}
