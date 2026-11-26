'use client';
import { Package } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ProductListQuery } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';

import { productsSearch, type useProducts } from '../api/products';
import { ProductFilters } from './product-filters';
import { ProductList, type ProductSelection } from './product-list';
import { ProductsLoading } from './products-loading';
import { Refreshing } from '@/components/refreshing';
import { UrlLink } from '@/components/url-link';

type ProductResultsProps = {
  query: ProductListQuery;
  products: ReturnType<typeof useProducts>;
  children: ReactNode;
  onAddProduct?: () => void;
  onAdjust?: (variantId: string) => void;
  onChangeStock?: (productId: string) => void;
  selection?: ProductSelection;
};
export function ProductResults({ onAddProduct, children, ...results }: ProductResultsProps) {
  const { query } = results;
  const empty = isEmptyCatalogue(results);
  return (
    <>
      {empty ? null : (
        <ProductFilters
          key={`${query.search}|${query.readiness}|${query.categoryId}|${query.brandId}`}
          query={query}
        />
      )}
      {children}
      {empty ? <EmptyCatalogue onAddProduct={onAddProduct} /> : <ProductResultList {...results} />}
    </>
  );
}

function isEmptyCatalogue({ products, query }: Pick<ProductResultsProps, 'products' | 'query'>) {
  return (
    products.isSuccess &&
    !products.isPlaceholderData &&
    products.data.items.length === 0 &&
    !query.cursor &&
    !query.search &&
    !query.readiness &&
    !query.categoryId &&
    !query.brandId
  );
}

function ProductResultList({
  query,
  products,
  onAdjust,
  onChangeStock,
  selection,
}: Omit<ProductResultsProps, 'children' | 'onAddProduct'>) {
  if (products.isPending) return <ProductsLoading />;
  if (products.error)
    return (
      <QueryError
        message={products.error.message}
        onRetry={() => void products.refetch()}
        retryLabel="Retry products"
      />
    );
  const pageHref = (cursor?: string) => `/products?${productsSearch({ ...query, cursor })}`;
  return (
    <Refreshing active={products.isPlaceholderData}>
      {products.data.items.length ? (
        <ProductList
          products={products.data.items}
          onAdjust={onAdjust}
          onChangeStock={onChangeStock}
          selection={selection}
        />
      ) : (
        <div className="space-y-2 rounded-lg border border-border bg-surface p-6">
          <p>No products on this page.</p>
          <UrlLink
            href="/products"
            className="inline-flex min-h-10 items-center text-action underline"
          >
            Clear filters
          </UrlLink>
        </div>
      )}
      <nav aria-label="Product pages" className="flex flex-wrap gap-4">
        {query.cursor ? (
          <UrlLink
            className="inline-flex min-h-10 items-center text-action underline"
            href={pageHref()}
          >
            First page
          </UrlLink>
        ) : null}
        {products.data.nextCursor ? (
          <UrlLink
            className="inline-flex min-h-10 items-center text-action underline"
            href={pageHref(products.data.nextCursor)}
          >
            Next page
          </UrlLink>
        ) : null}
      </nav>
    </Refreshing>
  );
}

function EmptyCatalogue({ onAddProduct }: Pick<ProductResultsProps, 'onAddProduct'>) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-14 text-center md:py-20">
      <Package size={48} strokeWidth={1.25} aria-hidden="true" className="text-text-muted" />
      <h2 className="text-lg font-semibold text-text">No products yet</h2>
      <p className="text-sm text-text-muted">
        Products you add show here, and Dakly uses them to answer chats and take orders.
      </p>
      {onAddProduct ? (
        <Button className="mt-2" onClick={onAddProduct}>
          <span aria-hidden="true">+</span> Add product
        </Button>
      ) : null}
    </div>
  );
}
