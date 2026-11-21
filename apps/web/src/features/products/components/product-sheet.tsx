'use client';
import { Pencil } from 'lucide-react';
import { useState } from 'react';

import type { ProductResponse, ProductTab } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
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
import { StockAdjustmentForm } from './stock-adjustment-form';
import { SessionDialog } from '@/components/session-dialog';
import { useSessionContext } from '@/lib/session-context';

type ProductSheetProps = {
  productId: string;
  tab: ProductTab;
  onTab: (tab: ProductTab) => void;
  onClose: () => void;
};

export function ProductSheet({ productId, tab, onTab, onClose }: ProductSheetProps) {
  const { data, error, isPending, refetch } = useGetProduct(productId);

  return (
    <SessionDialog
      title={data?.name ?? 'Product'}
      className="inset-y-0 right-0 left-auto m-0 h-dvh max-w-md rounded-none border-y-0 border-r-0 border-l shadow-overlay"
      open
      onClose={onClose}
    >
      {error ? (
        <QueryError message={error.message} onRetry={() => refetch()} retryLabel="Retry product" />
      ) : null}
      {isPending ? <ProductsLoading /> : null}
      {data ? <ProductDetails product={data} tab={tab} onTab={onTab} /> : null}
    </SessionDialog>
  );
}

type ProductDetailsProps = {
  product: ProductResponse;
  tab: ProductTab;
  onTab: (tab: ProductTab) => void;
};

function ProductDetails({ product, tab, onTab }: ProductDetailsProps) {
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
        <ProductTabs product={product} tab={tab} onTab={onTab} change={change} canEdit={canEdit} />
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
    <header className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ProductThumbnail product={product} />
        <div className="min-w-0 flex-1">
          {product.category ? (
            <p className="text-xs wrap-anywhere text-text-muted">{product.category}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {price ? (
              <span className="text-sm font-semibold text-text tabular-nums">{price}</span>
            ) : (
              <span className="text-sm font-semibold text-danger tabular-nums">No price</span>
            )}
            <ProductReadiness product={product} />
          </div>
        </div>
      </div>
      {canEdit ? (
        <Button variant="secondary" onClick={onEdit} aria-label="Edit product">
          <Pencil size={16} aria-hidden="true" />
          Edit
        </Button>
      ) : null}
    </header>
  );
}

type ProductTabsProps = {
  product: ProductResponse;
  tab: ProductTab;
  onTab: (tab: ProductTab) => void;
  change: ReturnType<typeof useChangeProduct>;
  canEdit: boolean;
};

function ProductTabs({ product, tab, onTab, change, canEdit }: ProductTabsProps) {
  return (
    <Tabs value={tab} onValueChange={(val) => onTab(val as ProductTab)} className="space-y-4">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="stock">Stock</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="space-y-6 pt-0">
        <ProductOverview product={product} change={change} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="stock" className="space-y-4 pt-0">
        <ProductStockBreakdown product={product} canEdit={canEdit} />
      </TabsContent>
    </Tabs>
  );
}

function ProductStockBreakdown({
  product,
  canEdit,
}: {
  product: ProductResponse;
  canEdit: boolean;
}) {
  const [adjusting, setAdjusting] = useState<string>();
  const variant = product.variants.find((item) => item.id === adjusting);
  if (!product.isStockTracked) {
    return <p className="text-sm text-text-muted">Not tracked</p>;
  }
  return (
    <div className="space-y-2">
      {product.variants.map((item) => (
        <div
          key={item.id}
          className="space-y-1 rounded-lg border border-border bg-surface-muted p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-text">{item.title}</span>
            {item.sku ? <span className="text-xs text-text-muted">SKU: {item.sku}</span> : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-text-muted">
              <span className="font-semibold text-text tabular-nums">{item.available}</span>{' '}
              available · {item.reserved} reserved · {item.onHand} on hand
            </p>
            {canEdit ? (
              <Button
                variant="secondary"
                aria-label={`Change stock for ${item.title}`}
                onClick={() => setAdjusting(item.id)}
              >
                Change stock
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      {variant ? (
        <StockAdjustmentForm
          productName={product.name}
          variant={variant}
          onClose={() => setAdjusting(undefined)}
        />
      ) : null}
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
  const sellingPrice = productPriceRange(product) ?? 'No price';
  const cost = firstVariantCostAmount(product);
  const profit = firstVariantProfitAmount(product);
  const totalAvailable = product.variants.reduce((total, variant) => total + variant.available, 0);
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
          <Button
            type="button"
            variant="link"
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
  );
}
