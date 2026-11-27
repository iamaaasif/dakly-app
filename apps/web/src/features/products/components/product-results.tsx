'use client';
import { PackageOpen, SearchX } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { formatCount } from '@dakly/contracts/money';
import type { ProductListQuery } from '@dakly/contracts/products';
import { Button } from '@dakly/ui/button';
import { QueryError } from '@dakly/ui/query-error';
import { TableCard, TableFooter, TableToolbar } from '@dakly/ui/table';

import { productsSearch, type useProducts } from '../api/products';
import { useProductColumns } from '../product-columns';
import { ProductFilters } from './product-filters';
import { ProductList, type ProductSelection } from './product-list';
import { ProductToolbarActions } from './product-toolbar-actions';
import { ProductsLoading } from './products-loading';
import { Refreshing } from '@/components/refreshing';
import { UrlLink } from '@/components/url-link';
import { useUrlRouter } from '@/lib/use-url-query';

type ProductResultsProps = {
  query: ProductListQuery;
  products: ReturnType<typeof useProducts>;
  children: ReactNode;
  onAddProduct?: () => void;
  onImport?: () => void;
  onAdjust?: (variantId: string) => void;
  onChangeStock?: (productId: string) => void;
  selection?: ProductSelection;
};

export function ProductResults({ children, ...results }: ProductResultsProps) {
  const { query, onAddProduct } = results;
  if (isEmptyCatalogue(results)) return <EmptyCatalogue onAddProduct={onAddProduct} />;
  return (
    // Filters start a new page trail, so the card is keyed by them.
    <ProductCatalogue
      key={`${query.search}|${query.readiness}|${query.categoryId}|${query.brandId}|${query.sort}`}
      {...results}
    >
      {children}
    </ProductCatalogue>
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

function ProductCatalogue({ children, onImport, ...results }: ProductResultsProps) {
  const { query } = results;
  const router = useUrlRouter();
  const { columns, toggle } = useProductColumns();
  const filter = (change: Partial<ProductListQuery>) =>
    router.push(`/products?${productsSearch({ ...query, ...change, cursor: undefined })}`);
  return (
    <TableCard>
      <TableToolbar className="gap-3 p-4">
        <ProductFilters query={query} />
        <ProductToolbarActions
          query={query}
          columns={columns}
          onToggleColumn={toggle}
          onImport={onImport}
        />
      </TableToolbar>
      {children}
      <ProductResultList
        {...results}
        columns={columns}
        onReadiness={(readiness) => filter({ readiness })}
      />
    </TableCard>
  );
}

// The server pages by cursor, so the page number comes from the pages this visit has seen.
function usePageTrail(query: ProductListQuery) {
  const router = useUrlRouter();
  const [trail, setTrail] = useState<(string | undefined)[]>(
    query.cursor ? [undefined, query.cursor] : [undefined],
  );
  const index = Math.max(trail.indexOf(query.cursor), 0);
  const go = (cursor: string | undefined) =>
    router.push(`/products?${productsSearch({ ...query, cursor })}`);
  return {
    page: index + 1,
    next: (cursor: string) => {
      setTrail([...trail.slice(0, index + 1), cursor]);
      go(cursor);
    },
    previous: () => go(trail[index - 1]),
  };
}

type ResultListProps = Omit<ProductResultsProps, 'children' | 'onAddProduct' | 'onImport'> &
  Pick<Parameters<typeof ProductList>[0], 'columns' | 'onReadiness'>;

function ProductResultList({ products, columns, onReadiness, ...rest }: ResultListProps) {
  const { query } = rest;
  const trail = usePageTrail(query);
  if (products.isPending) return <ProductsLoading />;
  if (products.error)
    return (
      <QueryError
        message={products.error.message}
        onRetry={() => void products.refetch()}
        retryLabel="Retry products"
      />
    );
  const { items, nextCursor, totalCount } = products.data;
  const counted = Math.max(1, Math.ceil(totalCount / query.limit));
  const pageCount = nextCursor ? Math.max(counted, trail.page + 1) : trail.page;
  return (
    <Refreshing active={products.isPlaceholderData}>
      {items.length ? (
        <ProductList
          products={items}
          columns={columns}
          readiness={query.readiness}
          onReadiness={onReadiness}
          onAdjust={rest.onAdjust}
          onChangeStock={rest.onChangeStock}
          selection={rest.selection}
        />
      ) : (
        <NoMatches />
      )}
      <TableFooter
        summary={`Showing ${formatCount(items.length)} of ${formatCount(totalCount)}`}
        page={trail.page}
        pageCount={pageCount}
        onPrevious={trail.previous}
        onNext={() => nextCursor && trail.next(nextCursor)}
      />
    </Refreshing>
  );
}

function NoMatches() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <SearchX aria-hidden="true" size={32} strokeWidth={1.25} className="text-text-subtle" />
      <p className="font-semibold text-text">No products on this page</p>
      <UrlLink
        href="/products"
        className="inline-flex min-h-10 items-center text-sm font-medium text-action underline"
      >
        Clear filters
      </UrlLink>
    </div>
  );
}

function EmptyCatalogue({ onAddProduct }: Pick<ProductResultsProps, 'onAddProduct'>) {
  return (
    <TableCard>
      <div className="flex flex-col items-center gap-2 px-6 py-20 text-center md:py-24">
        <PackageOpen aria-hidden="true" size={56} strokeWidth={1.25} className="text-text-subtle" />
        <h2 className="mt-2 text-md font-semibold text-text">No product created yet</h2>
        <p className="text-sm text-text-muted">Once you create a product, it will show here.</p>
        {onAddProduct ? (
          <Button className="mt-3 gap-1.5" onClick={onAddProduct}>
            <span aria-hidden="true">+</span> Add product
          </Button>
        ) : null}
      </div>
    </TableCard>
  );
}
