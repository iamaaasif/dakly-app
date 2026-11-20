'use client';
import { Pencil } from 'lucide-react';
import { useState } from 'react';

import type { ProductResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dakly/ui/tabs';

import { useChangeProduct } from '../api/change-product';
import { useGetProduct } from '../api/get-product';
import {
  firstVariantCostAmount,
  firstVariantProfitAmount,
  productPriceRange,
} from '../product-prices';
import { ProductForm } from './product-form';
import { ProductPhotos } from './product-photos';
import { ProductReadiness } from './product-readiness';
import { ProductThumbnail } from './product-thumbnail';
import { ProductsLoading } from './products-loading';
import { SessionDialog } from '@/components/session-dialog';
import { useSessionContext } from '@/lib/session-context';

type ProductSheetProps = { productId: string; onClose: () => void };

export function ProductSheet({ productId, onClose }: ProductSheetProps) {
  const { data, error, isPending, refetch } = useGetProduct(productId);

  return (
    <SessionDialog
      title={data?.name ?? 'Product'}
      className="inset-y-0 right-0 left-auto m-0 flex h-dvh w-full max-w-md flex-col overflow-y-auto rounded-none border-y-0 border-r-0 border-l border-border bg-surface p-6 text-text shadow-overlay"
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

type ProductDetailsProps = {
  product: ProductResponse;
};

function ProductDetails({ product }: ProductDetailsProps) {
  const change = useChangeProduct(product.id);
  const { data: session } = useSessionContext();
  const [editing, setEditing] = useState(false);
  const canEdit = session?.currentStore?.canEditProducts ?? false;

  return (
    <div className="space-y-6">
      <ProductDetailHeader
        product={product}
        canEdit={canEdit && !editing}
        onEdit={() => setEditing(true)}
      />
      {editing && canEdit ? (
        <ProductForm
          product={product}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <ProductTabs product={product} change={change} canEdit={canEdit} />
      )}
      {change.error ? (
        <p role="alert" className="text-danger">
          {change.error.message}
        </p>
      ) : null}
    </div>
  );
}

type ProductDetailHeaderProps = {
  product: ProductResponse;
  canEdit: boolean;
  onEdit: () => void;
};

function ProductDetailHeader({ product, canEdit, onEdit }: ProductDetailHeaderProps) {
  const price = productPriceRange(product);

  return (
    <div data-testid="product-detail-header" className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ProductThumbnail product={product} />
        <div className="min-w-0 flex-1">
          {product.category ? (
            <p className="text-xs wrap-anywhere text-text-muted">{product.category}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'text-sm font-semibold tabular-nums',
                price === 'No price' ? 'text-danger' : 'text-text',
              )}
            >
              {price}
            </span>
            <ProductReadiness product={product} />
          </div>
        </div>
      </div>
      {canEdit ? (
        <Button
          variant="secondary"
          onClick={onEdit}
          className="h-8 min-h-8 shrink-0 px-2.5 text-xs font-medium"
          aria-label="Edit product"
        >
          <Pencil size={13} aria-hidden="true" />
          Edit
        </Button>
      ) : null}
    </div>
  );
}

type ProductTabsProps = {
  product: ProductResponse;
  change: ReturnType<typeof useChangeProduct>;
  canEdit: boolean;
};

function ProductTabs({ product, change, canEdit }: ProductTabsProps) {
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="stock">Stock</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="space-y-6 pt-0">
        <ProductOverview product={product} change={change} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="stock" className="space-y-4 pt-0">
        <ProductStockBreakdown product={product} />
      </TabsContent>
    </Tabs>
  );
}

function ProductStockBreakdown({ product }: { product: ProductResponse }) {
  if (!product.isStockTracked) {
    return <p className="text-sm text-text-muted">Not tracked</p>;
  }
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-text">Stock</h3>
      <div className="space-y-2">
        {product.variants.map((v) => (
          <div
            key={v.id}
            className="space-y-1 rounded-lg border border-border bg-surface-muted p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text">{v.title}</span>
              {v.sku ? <span className="text-xs text-text-muted">SKU: {v.sku}</span> : null}
            </div>
            <p className="text-xs text-text-muted">
              <span className="font-semibold text-text tabular-nums">{v.available}</span> available
              · {v.reserved} reserved · {v.onHand} on hand
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PriceTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-surface-muted p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm font-semibold text-text tabular-nums">{value}</p>
    </div>
  );
}

type ProductOverviewProps = {
  product: ProductResponse;
  change: ReturnType<typeof useChangeProduct>;
  canEdit: boolean;
};

function ProductOverview({ product, change, canEdit }: ProductOverviewProps) {
  const sellingPrice = productPriceRange(product);
  const cost = firstVariantCostAmount(product);
  const profit = firstVariantProfitAmount(product);
  const totalAvailable = product.variants.reduce((total, v) => total + v.available, 0);
  const inStock = product.isStockTracked ? `${totalAvailable} available` : 'Not tracked';

  return (
    <>
      <ProductPhotos product={product} />
      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold text-text">Description</h3>
        <p className="text-sm wrap-anywhere whitespace-pre-wrap text-text-muted">
          {product.description || "No description yet. It's used in posts and your order link."}
        </p>
      </section>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PriceTile label="Selling price" value={sellingPrice} />
        <PriceTile label="Your cost" value={cost} />
        <PriceTile label="Profit each" value={profit} />
        <PriceTile label="In stock" value={inStock} />
      </div>
      {canEdit ? (
        <div className="pt-2">
          <button
            type="button"
            disabled={change.isPending}
            className="text-sm text-text-muted underline hover:text-text disabled:opacity-50"
            onClick={() =>
              change.mutate({ status: product.status === 'hidden' ? 'active' : 'hidden' })
            }
          >
            {product.status === 'hidden' ? 'Show product' : 'Hide product'}
          </button>
        </div>
      ) : null}
    </>
  );
}
