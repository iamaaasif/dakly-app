'use client';
import Link from 'next/link';

import type { ProductListQuery } from '@dakly/contracts/products';
import { QueryError } from '@dakly/ui/query-error';

import { productsSearch, type useProducts } from '../api/products';
import { ProductList } from './product-list';
import { ProductsLoading } from './products-loading';
import { Refreshing } from '@/components/refreshing';

type ProductResultsProps = {
  query: ProductListQuery;
  products: ReturnType<typeof useProducts>;
  onAdjust?: (variantId: string) => void;
};
export function ProductResults({ query, products, onAdjust }: ProductResultsProps) {
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
        <ProductList query={query} products={products.data.items} onAdjust={onAdjust} />
      ) : (
        <div className="space-y-2 rounded-lg border border-border bg-surface p-6">
          <p>No products on this page.</p>
          <Link
            href="/products"
            className="inline-flex min-h-10 items-center text-action underline"
          >
            Clear filters
          </Link>
        </div>
      )}
      <nav aria-label="Product pages" className="flex flex-wrap gap-4">
        {query.cursor ? (
          <Link
            className="inline-flex min-h-10 items-center text-action underline"
            href={pageHref()}
          >
            First page
          </Link>
        ) : null}
        {products.data.nextCursor ? (
          <Link
            className="inline-flex min-h-10 items-center text-action underline"
            href={pageHref(products.data.nextCursor)}
          >
            Next page
          </Link>
        ) : null}
      </nav>
    </Refreshing>
  );
}
