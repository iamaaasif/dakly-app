'use client';
import { useState } from 'react';

import type { ProductListQuery, ProductListResponse, ProductTab } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';

import { productsSearch, useProducts } from '../api/products';
import { parseProductsScreen } from '../products-url';
import { useBulkSelection } from '../use-bulk-selection';
import { ExportProductsButtons } from './export-products-buttons';
import { ImportProductsDialog } from './import-products-dialog';
import { ProductBulkSection } from './product-bulk-section';
import { ProductFilters } from './product-filters';
import { ProductForm } from './product-form';
import { ProductResults } from './product-results';
import { ProductSheet } from './product-sheet';
import { QuickAddModal } from './quick-add-modal';
import { RestockDialog } from './restock-dialog';
import { SessionDialog } from '@/components/session-dialog';
import { StorePage } from '@/components/store-page';
import { useSessionContext } from '@/lib/session-context';
import { useUrlQuery, useUrlRouter } from '@/lib/use-url-query';

type ProductsScreenProps = {
  query: ProductListQuery;
  adjust?: string;
  productId?: string;
  productTab?: ProductTab;
  create?: '1';
  importing?: '1';
};
export function ProductsScreen(initial: ProductsScreenProps) {
  const { query, adjust, productId, productTab, create, importing } = useUrlQuery(
    initial,
    parseProductsScreen,
  );
  const { data: session } = useSessionContext();
  const products = useProducts(query);
  const router = useUrlRouter();
  const [stockError, setStockError] = useState<string | null>(null);
  const listHref = `/products?${productsSearch(query)}`;
  const onAdjust = (id: string) => router.push(`${listHref}&adjust=${encodeURIComponent(id)}`);
  const canEdit = Boolean(session?.currentStore?.canEditProducts);
  const bulk = useBulkSelection(canEdit);
  return (
    <StorePage permission="canViewProducts">
      <main className="space-y-6 p-6 md:p-8">
        <ProductsHeader canEdit={canEdit} query={query} listHref={listHref} importing={importing} />
        <section aria-label="Product catalogue" className="space-y-4 md:space-y-0">
          <ProductFilters key={`${query.search}|${query.readiness}`} query={query} />
          <ProductBulkSection bulk={bulk} />
          <ProductResults
            query={query}
            products={products}
            onAdjust={canEdit ? onAdjust : undefined}
            selection={bulk.selection}
          />
        </section>
        {stockError ? (
          <p role="alert" className="text-danger">
            {stockError}
          </p>
        ) : null}
        {create && canEdit ? (
          <AddProductModal listHref={listHref} onStockError={setStockError} />
        ) : null}
        {productId ? (
          <SelectedProductSheet
            key={productId}
            productId={productId}
            productTab={productTab}
            query={query}
            onClose={() => {
              setStockError(null);
              router.replace(listHref);
            }}
          />
        ) : null}
        <SelectedRestock
          products={products.data}
          variantId={canEdit ? adjust : undefined}
          onClose={() => router.replace(listHref)}
        />
      </main>
    </StorePage>
  );
}

type ProductsHeaderProps = {
  canEdit: boolean;
  query: ProductListQuery;
  listHref: string;
  importing?: '1';
};

function ProductsHeader({ canEdit, query, listHref, importing }: ProductsHeaderProps) {
  const router = useUrlRouter();
  const [quickAdding, setQuickAdding] = useState(false);
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">Products</h1>
        <p className="mt-1 text-sm text-text-muted">
          What you sell, with prices, sizes and stock. Dakly uses it to answer chats, take orders
          and fill your order link.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <ExportProductsButtons query={query} />
        {canEdit ? (
          <>
            <Button variant="secondary" onClick={() => router.push(`${listHref}&import=1`)}>
              Import from Excel or CSV
            </Button>
            <Button onClick={() => setQuickAdding(true)}>
              <span aria-hidden="true">+ </span>Add product
            </Button>
          </>
        ) : null}
      </div>
      {quickAdding && canEdit ? <QuickAddModal onClose={() => setQuickAdding(false)} /> : null}
      {importing && canEdit ? (
        <ImportProductsDialog onClose={() => router.replace(listHref)} />
      ) : null}
    </header>
  );
}

function AddProductModal({
  listHref,
  onStockError,
}: {
  listHref: string;
  onStockError: (error: string) => void;
}) {
  const router = useUrlRouter();
  return (
    <SessionDialog title="Add product" open onClose={() => router.replace(listHref)}>
      <ProductForm
        onSaved={(product, failedSizes) => {
          router.replace(`${listHref}&product=${product.id}`);
          if (failedSizes.length > 0) {
            onStockError(`Could not set initial stock for: ${failedSizes.join(', ')}`);
          }
        }}
        onCancel={() => router.replace(listHref)}
      />
    </SessionDialog>
  );
}

type SelectedRestockProps = {
  products?: ProductListResponse;
  variantId?: string;
  onClose: () => void;
};
function SelectedRestock({ products, variantId, onClose }: SelectedRestockProps) {
  if (!variantId || !products) return null;
  const product = products.items.find((item) =>
    item.variants.some((variant) => variant.id === variantId),
  );
  if (!product) return <p role="alert">That product is not on this page.</p>;
  return <RestockDialog product={product} onClose={onClose} />;
}

type SelectedProductSheetProps = {
  productId: string;
  productTab?: ProductTab;
  query: ProductListQuery;
  onClose: () => void;
};

function SelectedProductSheet({
  productId,
  productTab,
  query,
  onClose,
}: SelectedProductSheetProps) {
  const router = useUrlRouter();
  const onTab = (nextTab: ProductTab) => {
    const params = new URLSearchParams(productsSearch(query));
    params.set('product', productId);
    if (nextTab !== 'overview') params.set('productTab', nextTab);
    router.push(`/products?${params.toString()}`);
  };

  return (
    <ProductSheet
      productId={productId}
      tab={productTab ?? 'overview'}
      onTab={onTab}
      onClose={onClose}
    />
  );
}
