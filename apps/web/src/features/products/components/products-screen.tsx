'use client';
import { useState } from 'react';

import type { ProductListQuery, ProductListResponse } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { PageHeader } from '@dakly/ui/page-header';

import { productsSearch, useProducts } from '../api/products';
import { parseProductsScreen } from '../products-url';
import { useBulkSelection } from '../use-bulk-selection';
import { ChangeStockDialog } from './change-stock-dialog';
import { ImportProductsDialog } from './import-products-dialog';
import { ProductBulkPanel } from './product-bulk-panel';
import { ProductBulkSection } from './product-bulk-section';
import { ProductResults } from './product-results';
import { QuickAddModal } from './quick-add-modal';
import { RestockDialog } from './restock-dialog';
import { StorePage } from '@/components/store-page';
import { handOffProductChange, useHandedOffProductChange } from '@/lib/assistant-product-handoff';
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
  const [changingStockOf, setChangingStockOf] = useState<string>();
  const [quickAdding, setQuickAdding] = useState(false);
  const listHref = `/products?${productsSearch(query)}`;
  const onAdjust = (id: string) => router.push(`${listHref}&adjust=${encodeURIComponent(id)}`);
  const changingStock = products.data?.items.find((item) => item.id === changingStockOf);
  const canEdit = Boolean(session?.currentStore?.canEditProducts);
  const bulk = useBulkSelection(canEdit);
  const editActions = canEdit
    ? {
        onAddProduct: () => setQuickAdding(true),
        onImport: () => router.push(`${listHref}&import=1`),
        onAdjust,
        onChangeStock: setChangingStockOf,
      }
    : {};
  return (
    <StorePage permission="canViewProducts">
      <main className="space-y-5 p-4 md:p-8">
        <ProductsHeader onAddProduct={editActions.onAddProduct} />
        <section aria-label="Product catalogue">
          <ProductResults
            query={query}
            products={products}
            {...editActions}
            selection={bulk.selection}
          >
            <AssistantChange canEdit={canEdit} />
            <ProductBulkSection bulk={bulk} />
          </ProductResults>
        </section>
        <ImportDialog
          open={Boolean(importing && canEdit)}
          onClose={() => router.replace(listHref)}
        />
        {quickAdding && canEdit ? <QuickAddModal onClose={() => setQuickAdding(false)} /> : null}
        {changingStock ? (
          <ChangeStockDialog
            product={changingStock}
            onClose={() => setChangingStockOf(undefined)}
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

function ProductsHeader({ onAddProduct }: { onAddProduct?: () => void }) {
  return (
    <PageHeader
      title="Products"
      description="What you sell, with prices, sizes and stock. Dakly uses it to answer chats, take orders, sell in the shop and fill your order link."
      actions={
        onAddProduct ? (
          <Button onClick={onAddProduct} className="gap-1.5">
            <span aria-hidden="true">+</span> Add product
          </Button>
        ) : null
      }
    />
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <ImportProductsDialog onClose={onClose} /> : null;
}

// A change Ask Dakly AI prepared opens here as the bulk edit review, over the list.
function AssistantChange({ canEdit }: { canEdit: boolean }) {
  const change = useHandedOffProductChange();
  if (!change || !canEdit) return null;
  return (
    <ProductBulkPanel
      key={change.rows.map((row) => row.productId).join()}
      products={change.products}
      preset={undefined}
      proposed={change.rows}
      onClose={() => handOffProductChange(undefined)}
    />
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
