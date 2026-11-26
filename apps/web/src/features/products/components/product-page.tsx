'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { AssistantProductDraft } from '@dakly/contracts/assistant';
import type { ProductResponse } from '@dakly/contracts/products';
import { ApiError } from '@dakly/ui/api-client';
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
import { ProductSaveError } from './product-form-layout';
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
  const { data, error, refetch } = useGetProduct(productId);
  const [saves, setSaves] = useState(0);
  const [reloadError, setReloadError] = useState<Error | null>(null);
  const { data: session } = useSessionContext();
  if (!data && error)
    return (
      <div className="p-6">
        <QueryError message={error.message} onRetry={() => refetch()} retryLabel="Retry product" />
      </div>
    );
  if (!data) return <ProductsLoading />;
  // After a save the form starts again from what the server holds, so new rows have their ids.
  return (
    <LoadedProductPage
      key={`${data.id}:${saves}`}
      product={data}
      reloadError={reloadError}
      readOnly={!session?.currentStore?.canEditProducts}
      onReload={async () => {
        const next = await refetch();
        setReloadError(next.error);
        if (next.isSuccess) setSaves((count) => count + 1);
      }}
    />
  );
}

type LoadedProductPageProps = {
  product: ProductResponse;
  readOnly: boolean;
  onReload: () => Promise<void>;
  reloadError: Error | null;
};

function LoadedProductPage({ product, readOnly, onReload, reloadError }: LoadedProductPageProps) {
  const router = useRouter();
  const stock = stockKey(product);
  const [loaded, setLoaded] = useState({ version: product.version, stock });
  const changeStatus = useChangeProduct(product.id, (saved) =>
    setLoaded((previous) => ({ ...previous, version: saved.version })),
  );
  const statusError = changeStatus.error;
  const statusConflict = statusError instanceof ApiError && statusError.code === 'PRODUCT_CHANGED';
  // Stock updates can refresh the form while this is still the version it loaded.
  if (product.version === loaded.version && stock !== loaded.stock) setLoaded({ ...loaded, stock });
  return (
    <ProductForm
      key={loaded.stock}
      product={product}
      expectedVersion={loaded.version}
      statusConflict={statusConflict ? statusError : undefined}
      onReload={onReload}
      onSaved={(_saved, failedStock) => {
        // A fresh read replaces both the version and the stock baseline for the next save.
        if (!failedStock.length) void onReload();
      }}
      page={{
        title: product.name,
        backHref: '/products',
        photos: <ProductPhotos product={product} />,
        readOnly,
        notice: (
          <ProductPageNotice readOnly={readOnly} reloadError={reloadError} onReload={onReload} />
        ),
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
            <StatusCard
              product={product}
              readOnly={readOnly}
              disabled={changeStatus.isPending}
              error={statusConflict ? null : statusError}
              onChangeStatus={(status) =>
                changeStatus.mutate({ status, expectedVersion: loaded.version })
              }
            />
          </>
        ),
        preview: <ProductChatPreview product={product} />,
      }}
    />
  );
}

function ProductPageNotice({
  readOnly,
  reloadError,
  onReload,
}: Pick<LoadedProductPageProps, 'readOnly' | 'reloadError' | 'onReload'>) {
  if (reloadError)
    return <QueryError message={reloadError.message} onRetry={onReload} retryLabel="Reload" />;
  return readOnly ? (
    <p role="status" className="text-sm text-text-muted">
      You can view products but not edit them.
    </p>
  ) : null;
}

function stockKey(product: ProductResponse) {
  return product.variants
    .map(({ id, onHand }) => `${id}:${onHand}`)
    .sort()
    .join(',');
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

type StatusCardProps = {
  product?: ProductResponse;
  readOnly?: boolean;
  disabled?: boolean;
  error?: Error | null;
  onChangeStatus?: (status: 'active' | 'hidden') => void;
};

function StatusCard({ product, readOnly, disabled, error, onChangeStatus }: StatusCardProps) {
  const [changingStock, setChangingStock] = useState(false);
  return (
    <Card className="space-y-3">
      <ProductStatusField
        savedStatus={product?.status}
        onChangeStatus={onChangeStatus}
        disabled={disabled}
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
          <ProductSaveError error={error} />
        </>
      ) : null}
    </Card>
  );
}
