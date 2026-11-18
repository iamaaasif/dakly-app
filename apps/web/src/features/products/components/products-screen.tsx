'use client';
import { useRouter } from 'next/navigation';

import type { ProductListQuery, ProductListResponse } from '@dakly/contracts/products';

import { productsSearch, useProducts } from '../api/products';
import { ProductFilters } from './product-filters';
import { ProductResults } from './product-results';
import { StockAdjustmentForm } from './stock-adjustment-form';
import { StorePage } from '@/components/store-page';
import { useSessionContext } from '@/lib/session-context';

type ProductsScreenProps = { query: ProductListQuery; adjust?: string };
export function ProductsScreen({ query, adjust }: ProductsScreenProps) {
  const { data: session } = useSessionContext();
  const products = useProducts(query);
  const router = useRouter();
  const listHref = `/products?${productsSearch(query)}`;
  const onAdjust = (id: string) => router.push(`${listHref}&adjust=${encodeURIComponent(id)}`);
  const canEdit = session?.currentStore?.canEditProducts;
  return (
    <StorePage permission="canViewProducts">
      <main className="space-y-6 p-6 md:p-8">
        <header>
          <h1 className="text-xl font-bold">Products</h1>
          <p className="mt-2 text-text-muted">What you sell, with prices, options and stock.</p>
        </header>
        <section aria-label="Product catalogue" className="space-y-4 md:space-y-0">
          <ProductFilters key={`${query.search}|${query.readiness}`} query={query} />
          <ProductResults
            query={query}
            products={products}
            onAdjust={canEdit ? onAdjust : undefined}
          />
        </section>
        {adjust && canEdit && products.data ? (
          <SelectedStockAdjustment
            products={products.data}
            variantId={adjust}
            onClose={() => router.replace(listHref)}
          />
        ) : null}
      </main>
    </StorePage>
  );
}

type SelectedStockAdjustmentProps = {
  products: ProductListResponse;
  variantId: string;
  onClose: () => void;
};
function SelectedStockAdjustment({ products, variantId, onClose }: SelectedStockAdjustmentProps) {
  const product = products.items.find((item) =>
    item.variants.some((variant) => variant.id === variantId),
  );
  const variant = product?.variants.find((item) => item.id === variantId);
  if (!product || !variant) return <p role="alert">That variant is not on this page.</p>;
  return <StockAdjustmentForm productName={product.name} variant={variant} onClose={onClose} />;
}
