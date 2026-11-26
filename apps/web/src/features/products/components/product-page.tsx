'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { AssistantProductDraft } from '@dakly/contracts/assistant';
import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { Card } from '@dakly/ui/card';
import { QueryError } from '@dakly/ui/query-error';

import { useChangeProduct } from '../api/change-product';
import { useGetProduct } from '../api/get-product';
import { assistantFilledFields } from '../product-assistant-draft';
import type { QuickAddHandoff } from '../quick-add-handoff';
import { ChangeStockDialog } from './change-stock-dialog';
import { ProductActionsMenu } from './product-actions-menu';
import { ProductChatPreview } from './product-chat-preview';
import { ProductForm } from './product-form';
import { ProductPhotos } from './product-photos';
import { ProductReadiness } from './product-readiness';
import { ProductStatusField } from './product-status-field';
import { ProductsLoading } from './products-loading';
import { useSessionContext } from '@/lib/session-context';

type NewProductPageProps = {
  initial?: QuickAddHandoff;
  assistantDraft?: AssistantProductDraft;
  duplicateId?: string;
};

export function NewProductPage({ duplicateId, ...draft }: NewProductPageProps) {
  if (duplicateId) return <DuplicateProduct key={duplicateId} productId={duplicateId} />;
  return <NewProductForm {...draft} />;
}

function DuplicateProduct({ productId }: { productId: string }) {
  const { data, error, refetch } = useGetProduct(productId);
  if (!data && error)
    return (
      <div className="p-6">
        <QueryError message={error.message} onRetry={() => refetch()} retryLabel="Retry product" />
      </div>
    );
  if (!data) return <ProductsLoading />;
  return <NewProductForm duplicateSource={data} />;
}

type NewProductFormProps = Omit<NewProductPageProps, 'duplicateId'> & {
  duplicateSource?: ProductResponse;
};

function NewProductForm({ initial, assistantDraft, duplicateSource }: NewProductFormProps) {
  const router = useRouter();
  return (
    <ProductForm
      initial={initial}
      assistantDraft={assistantDraft}
      duplicateSource={duplicateSource}
      onSaved={(product) => router.replace(`/products/${product.id}`)}
      page={{
        title: 'New product',
        backHref: '/products',
        notice: assistantDraft ? <AssistantNotice draft={assistantDraft} /> : undefined,
        photos: (
          <>
            <h2 className="text-base font-semibold text-text">Media</h2>
            <p className="text-sm text-text-muted">Create the product to add photos.</p>
          </>
        ),
        status: <StatusCard />,
      }}
    />
  );
}

export function EditProductPage({ productId }: { productId: string }) {
  const { data, error, isPending, refetch } = useGetProduct(productId);
  const [saves, setSaves] = useState(0);
  const { data: session } = useSessionContext();
  if (error)
    return (
      <div className="p-6">
        <QueryError message={error.message} onRetry={() => refetch()} retryLabel="Retry product" />
      </div>
    );
  if (isPending) return <ProductsLoading />;
  // After a save the form starts again from what the server holds, so new rows have their ids.
  return (
    <LoadedProductPage
      key={`${data.id}:${saves}:${data.variants.map((variant) => variant.onHand).join(',')}`}
      product={data}
      readOnly={!session?.currentStore?.canEditProducts}
      onSaved={async () => {
        await refetch();
        setSaves((count) => count + 1);
      }}
    />
  );
}

type LoadedProductPageProps = {
  product: ProductResponse;
  readOnly: boolean;
  onSaved: () => Promise<void>;
};

function LoadedProductPage({ product, readOnly, onSaved }: LoadedProductPageProps) {
  const router = useRouter();
  return (
    <ProductForm
      product={product}
      onSaved={(_saved, failedStock) => {
        if (!failedStock.length) void onSaved();
      }}
      page={{
        title: product.name,
        backHref: '/products',
        photos: <ProductPhotos product={product} />,
        readOnly,
        notice: readOnly ? (
          <p role="status" className="text-sm text-text-muted">
            You can view products but not edit them.
          </p>
        ) : undefined,
        status: (
          <>
            {readOnly ? null : (
              <div className="flex justify-end">
                <ProductActionsMenu
                  product={product}
                  onArchived={() => router.replace('/products')}
                />
              </div>
            )}
            <StatusCard product={product} readOnly={readOnly} />
          </>
        ),
        preview: <ProductChatPreview product={product} />,
      }}
    />
  );
}

function AssistantNotice({ draft }: { draft: AssistantProductDraft }) {
  return (
    <p role="status" className="rounded-lg border border-ai-soft bg-ai-soft p-3 text-sm text-text">
      <span className="font-semibold">Filled in by Dakly AI:</span>{' '}
      {assistantFilledFields(draft).join(', ')}. Check each one. Nothing is saved until you press
      Create.
    </p>
  );
}

type StatusCardProps = { product?: ProductResponse; readOnly?: boolean };

function StatusCard({ product, readOnly }: StatusCardProps) {
  const change = useChangeProduct(product?.id ?? '');
  const [changingStock, setChangingStock] = useState(false);
  return (
    <Card className="space-y-3">
      <ProductStatusField
        savedStatus={product?.status}
        onChangeStatus={product ? (status) => change.mutate({ status }) : undefined}
        disabled={change.isPending}
      />
      {product ? (
        <>
          <ProductReadiness product={product} />
          {product.isStockTracked && !readOnly ? (
            <Button type="button" variant="secondary" onClick={() => setChangingStock(true)}>
              Change stock
            </Button>
          ) : null}
          {changingStock ? (
            <ChangeStockDialog product={product} onClose={() => setChangingStock(false)} />
          ) : null}
          {change.error ? (
            <p role="alert" className="text-danger">
              {change.error.message}
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
