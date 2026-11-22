'use client';
import { useState } from 'react';

import type { ProductListQuery, ProductListResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';

import { productsSearch, useProducts } from '../api/products';
import { parseProductsScreen } from '../products-url';
import { useBulkSelection } from '../use-bulk-selection';
import { ExportProductsButtons } from './export-products-buttons';
import { ImportProductsDialog } from './import-products-dialog';
import { ProductBulkSection } from './product-bulk-section';
import { ProductFilters } from './product-filters';
import { ProductResults } from './product-results';
import { QuickAddModal } from './quick-add-modal';
import { RestockDialog } from './restock-dialog';
import { StorePage } from '@/components/store-page';
import { useSessionContext } from '@/lib/session-context';
import { useUrlQuery, useUrlRouter } from '@/lib/use-url-query';

type ProductsScreenProps = {
  query: ProductListQuery;
  adjust?: string;
  importing?: '1';
};
export function ProductsScreen(initial: ProductsScreenProps) {
  const { query, adjust, importing } = useUrlQuery(initial, parseProductsScreen);
  const { data: session } = useSessionContext();
  const products = useProducts(query);
  const router = useUrlRouter();
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
