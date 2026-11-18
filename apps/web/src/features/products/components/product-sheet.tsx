'use client';
import Image from 'next/image';
import { useState } from 'react';

import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { useChangeProduct } from '../api/change-product';
import { useGetProduct } from '../api/get-product';
import { ProductForm } from './product-form';
import { ProductsLoading } from './products-loading';
import { SessionDialog } from '@/components/session-dialog';
import { formatMoney } from '@/lib/format-money';
import { useSessionContext } from '@/lib/session-context';

type ProductSheetProps = { productId: string; onClose: () => void };
export function ProductSheet({ productId, onClose }: ProductSheetProps) {
  const selected = useGetProduct(productId);
  return (
    <SessionDialog
      title={selected.data?.name ?? 'Product'}
      className="inset-y-0 left-auto m-0 h-dvh max-w-sm rounded-none border-y-0 border-r-0"
      open
      onClose={onClose}
    >
      {selected.error ? (
        <QueryError
          message={selected.error.message}
          onRetry={() => void selected.refetch()}
          retryLabel="Retry product"
        />
      ) : null}
      {selected.isPending ? <ProductsLoading /> : null}
      {selected.data ? <ProductDetails product={selected.data} /> : null}
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
      {product.category ? (
        <p className="text-sm wrap-anywhere text-text-muted">{product.category}</p>
      ) : null}
      <ProductPictures product={product} />
      {editing && canEdit ? (
        <>
          <ProductForm product={product} onSaved={() => setEditing(false)} />
          <Button variant="secondary" onClick={() => setEditing(false)}>
            Cancel editing
          </Button>
        </>
      ) : (
        <>
          <ProductOverview product={product} />
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setEditing(true)}>Edit product</Button>
              <Button
                variant="secondary"
                loading={change.isPending}
                onClick={() =>
                  change.mutate({ status: product.status === 'hidden' ? 'active' : 'hidden' })
                }
              >
                {product.status === 'hidden' ? 'Show product' : 'Hide product'}
              </Button>
            </div>
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

function ProductPictures({ product }: ProductDetailsProps) {
  return (
    <section className="space-y-4" aria-label="Product photos">
      <h2 className="font-semibold">Photos ({product.photos.length})</h2>
      {product.photos.length ? (
        <div className="flex flex-wrap gap-4">
          {product.photos.map((photo, index) => (
            <Image
              key={photo.id}
              src={photo.url}
              alt={`${product.name} photo ${index + 1}`}
              width={80}
              height={80}
              unoptimized
              className="size-20 rounded-md object-cover"
            />
          ))}
        </div>
      ) : (
        <p className="text-text-muted">No photos yet.</p>
      )}
    </section>
  );
}

function ProductOverview({ product }: ProductDetailsProps) {
  const price = Math.min(...product.variants.map((variant) => variant.pricePoisha));
  return (
    <>
      <section className="space-y-2">
        <h2 className="font-semibold">Description</h2>
        <p className="wrap-anywhere whitespace-pre-wrap">
          {product.description || 'No description yet.'}
        </p>
      </section>
      <dl className="grid grid-cols-2 gap-4 rounded-lg bg-surface-muted p-4">
        <div>
          <dt className="text-sm text-text-muted">Price from</dt>
          <dd className="font-semibold tabular-nums">
            {price ? formatMoney(price) : 'Needs a price'}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-text-muted">Visibility</dt>
          <dd>{product.status === 'hidden' ? 'Hidden' : 'Shown'}</dd>
        </div>
      </dl>
      <section className="space-y-2">
        <h2 className="font-semibold">Stock</h2>
        {product.isStockTracked ? (
          product.variants.map((variant) => (
            <p key={variant.id} className="wrap-anywhere">
              {variant.title}: {variant.available} available · {variant.reserved} reserved
            </p>
          ))
        ) : (
          <p>Not tracked</p>
        )}
      </section>
    </>
  );
}
