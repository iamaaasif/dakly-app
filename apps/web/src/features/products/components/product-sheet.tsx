'use client';
import { useState } from 'react';

import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useChangeProduct } from '../api/change-product';
import { useGetProduct } from '../api/get-product';
import { ProductForm } from './product-form';
import { ProductPhotos } from './product-photos';
import { ProductReadiness } from './product-readiness';
import { ProductThumbnail } from './product-thumbnail';
import { ProductsLoading } from './products-loading';
import { SessionDialog } from '@/components/session-dialog';
import { formatMoney } from '@/lib/format-money';
import { useSessionContext } from '@/lib/session-context';

type ProductSheetProps = { productId: string; onClose: () => void };
export function ProductSheet({ productId, onClose }: ProductSheetProps) {
  const { data, error, isPending, refetch } = useGetProduct(productId);
  return (
    <SessionDialog
      title={data?.name ?? 'Product'}
      className="inset-y-0 left-auto m-0 h-dvh max-w-md rounded-none border-y-0 border-r-0"
      open
      onClose={onClose}
    >
      {error ? (
        <QueryError message={error.message} onRetry={() => refetch()} retryLabel="Retry product" />
      ) : null}
      {isPending ? <ProductsLoading /> : null}
      {data ? <ProductDetails product={data} /> : null}
    </SessionDialog>
  );
}

type ProductDetailsProps = { product: ProductResponse };

function ProductDetails({ product }: ProductDetailsProps) {
  const change = useChangeProduct(product.id);
  const { data: session } = useSessionContext();
  const [editing, setEditing] = useState(false);
  const canEdit = session?.currentStore?.canEditProducts;
  return (
    <div className="space-y-6">
      <ProductDetailHeader product={product} />
      <ProductPhotos product={product} />
      {editing && canEdit ? (
        <ProductForm
          product={product}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <ProductOverview product={product} />
          {canEdit ? (
            <ProductDetailActions
              product={product}
              isPending={change.isPending}
              onEdit={() => setEditing(true)}
              onToggleStatus={() =>
                change.mutate({ status: product.status === 'hidden' ? 'active' : 'hidden' })
              }
            />
          ) : null}
        </>
      )}
      {change.error ? (
        <p role="alert" className="text-danger">
          {change.error.message}
        </p>
      ) : null}
    </div>
  );
}

type ProductDetailHeaderProps = { product: ProductResponse };

function ProductDetailHeader({ product }: ProductDetailHeaderProps) {
  return (
    <div className="flex items-start gap-3">
      <ProductThumbnail product={product} />
      <div className="min-w-0 flex-1">
        {product.category ? (
          <p className="text-xs wrap-anywhere text-text-muted">{product.category}</p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <ProductReadiness product={product} />
        </div>
      </div>
    </div>
  );
}

type ProductDetailActionsProps = {
  product: ProductResponse;
  isPending: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
};

function ProductDetailActions({
  product,
  isPending,
  onEdit,
  onToggleStatus,
}: ProductDetailActionsProps) {
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <Button onClick={onEdit}>Edit product</Button>
      <Button variant="secondary" loading={isPending} onClick={onToggleStatus}>
        {product.status === 'hidden' ? 'Show product' : 'Hide product'}
      </Button>
    </div>
  );
}

function ProductOverview({ product }: ProductDetailsProps) {
  const prices = product.variants.map((variant) => variant.pricePoisha);
  const price = Math.min(...prices);
  const totalAvailable = product.variants.reduce((total, variant) => total + variant.available, 0);
  return (
    <>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-text">Description</h2>
        <p className="text-sm wrap-anywhere whitespace-pre-wrap text-text-muted">
          {product.description || "No description yet. It's used in posts and your order link."}
        </p>
      </section>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface-muted p-3">
        <div className="space-y-0.5">
          <dt className="text-xs text-text-muted">Price from</dt>
          <dd className="font-semibold text-text tabular-nums">
            {price ? formatMoney(price) : 'Needs a price'}
          </dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-xs text-text-muted">Visibility</dt>
          <dd className="text-sm font-medium text-text">
            {product.status === 'hidden' ? 'Hidden' : 'Shown'}
          </dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-xs text-text-muted">Stock</dt>
          <dd className="text-sm font-medium text-text">
            {product.isStockTracked ? `${totalAvailable} available` : 'Not tracked'}
          </dd>
        </div>
      </dl>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-text">Stock</h2>
        {product.isStockTracked ? (
          <div className="space-y-1.5">
            {product.variants.map((variant) => (
              <p key={variant.id} className="text-sm wrap-anywhere text-text-muted">
                <span className="font-medium text-text">{variant.title}:</span> {variant.available}{' '}
                available · {variant.reserved} reserved
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">Not tracked</p>
        )}
      </section>
    </>
  );
}
