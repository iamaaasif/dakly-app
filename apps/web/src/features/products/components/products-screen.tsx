'use client';
import { useRouter } from 'next/navigation';

import type { ProductListQuery, ProductListResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';

import { productsSearch, useProducts } from '../api/products';
import { ProductFilters } from './product-filters';
import { ProductForm } from './product-form';
import { ProductResults } from './product-results';
import { ProductSheet } from './product-sheet';
import { StockAdjustmentForm } from './stock-adjustment-form';
import { SessionDialog } from '@/components/session-dialog';
import { StorePage } from '@/components/store-page';
import { useSessionContext } from '@/lib/session-context';

type ProductsScreenProps = {
  query: ProductListQuery;
  adjust?: string;
  productId?: string;
  create?: '1';
};
export function ProductsScreen({ query, adjust, productId, create }: ProductsScreenProps) {
  const { data: session } = useSessionContext();
  const products = useProducts(query);
  const router = useRouter();
  const listHref = `/products?${productsSearch(query)}`;
  const onAdjust = (id: string) => router.push(`${listHref}&adjust=${encodeURIComponent(id)}`);
  const canEdit = session?.currentStore?.canEditProducts;
  return (
    <StorePage permission="canViewProducts">
      <main className="space-y-6 p-6 md:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text">Products</h1>
            <p className="mt-1 text-sm text-text-muted">
              What you sell, with prices, sizes and stock. Dakly uses it to answer chats, take
              orders, sell in the shop and fill your order link.
            </p>
          </div>
          {canEdit ? (
            <Button onClick={() => router.push(`${listHref}&create=1`)}>
              <span aria-hidden="true">+ </span>Add product
            </Button>
          ) : null}
        </header>
        <section aria-label="Product catalogue" className="space-y-4 md:space-y-0">
          <ProductFilters key={`${query.search}|${query.readiness}`} query={query} />
          <ProductResults
            query={query}
            products={products}
            onAdjust={canEdit ? onAdjust : undefined}
          />
        </section>
        {create && canEdit ? (
          <SessionDialog title="Add product" open onClose={() => router.replace(listHref)}>
            <ProductForm
              onSaved={(product) => router.replace(`${listHref}&product=${product.id}`)}
            />
          </SessionDialog>
        ) : null}
        {productId ? (
          <ProductSheet
            key={productId}
            productId={productId}
            onClose={() => router.replace(listHref)}
          />
        ) : null}
        <SelectedStockAdjustment
          products={products.data}
          variantId={canEdit ? adjust : undefined}
          onClose={() => router.replace(listHref)}
        />
      </main>
    </StorePage>
  );
}

type SelectedStockAdjustmentProps = {
  products?: ProductListResponse;
  variantId?: string;
  onClose: () => void;
};
function SelectedStockAdjustment({ products, variantId, onClose }: SelectedStockAdjustmentProps) {
  if (!variantId || !products) return null;
  const product = products.items.find((item) =>
    item.variants.some((variant) => variant.id === variantId),
  );
  const variant = product?.variants.find((item) => item.id === variantId);
  if (!product || !variant) return <p role="alert">That variant is not on this page.</p>;
  return <StockAdjustmentForm productName={product.name} variant={variant} onClose={onClose} />;
}
