import Link from 'next/link';

import type { ProductListQuery, ProductResponse } from '@dakly/contracts/products';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import { productsSearch } from '../api/products';
import { ProductReadiness } from './product-readiness';
import { ProductThumbnail } from './product-thumbnail';
import { formatMoney } from '@/lib/format-money';

type ProductListProps = {
  products: ProductResponse[];
  query: ProductListQuery;
  onAdjust?: (variantId: string) => void;
};

export function ProductList({ products, query, onAdjust }: ProductListProps) {
  return (
    <>
      <div className="hidden md:block [&>div]:rounded-t-none [&>div]:border-t-0">
        <ProductTable products={products} query={query} onAdjust={onAdjust} />
      </div>
      <ProductCards products={products} query={query} onAdjust={onAdjust} />
    </>
  );
}

function ProductTable({ products, query, onAdjust }: ProductListProps) {
  return (
    <Table aria-label="Products">
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead>Stock</TableHead>
          <TableHead>Status</TableHead>
          {onAdjust ? (
            <TableHead className="w-28 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id}>
            <TableCell>
              <ProductIdentity product={product} query={query} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <ProductPrice product={product} />
            </TableCell>
            <TableCell>
              <ProductStock product={product} onAdjust={onAdjust} />
            </TableCell>
            <TableCell>
              <ProductReadiness product={product} />
            </TableCell>
            {onAdjust ? (
              <TableCell className="text-right">
                {product.isStockTracked && product.variants.length > 0 ? (
                  <Button
                    variant="secondary"
                    className="h-8 min-h-8 rounded-md px-3 text-xs font-medium"
                    aria-label={`Restock ${product.name}`}
                    onClick={() => onAdjust(product.variants[0]!.id)}
                  >
                    + Restock
                  </Button>
                ) : null}
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ProductCards({ products, query, onAdjust }: ProductListProps) {
  return (
    <ul aria-label="Products" className="space-y-3 md:hidden">
      {products.map((product) => (
        <li key={product.id} className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <ProductIdentity product={product} query={query} />
            <div className="shrink-0 text-right tabular-nums">
              <ProductPrice product={product} />
            </div>
          </div>
          <ProductStock product={product} onAdjust={onAdjust} />
          <div className="flex items-center justify-between gap-2 pt-1">
            <ProductReadiness product={product} />
            {onAdjust && product.isStockTracked && product.variants.length > 0 ? (
              <Button
                variant="secondary"
                className="min-h-10 rounded-md px-3 text-xs font-medium"
                aria-label={`Restock ${product.name}`}
                onClick={() => onAdjust(product.variants[0]!.id)}
              >
                + Restock
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

type ProductPartProps = { product: ProductResponse };

function ProductIdentity({ product, query }: ProductPartProps & { query: ProductListQuery }) {
  const href = `/products?${productsSearch(query)}&product=${product.id}`;
  const code = product.variants.find((v) => v.sku)?.sku;
  const subtitle = [product.category, code].filter(Boolean).join(' · ');
  return (
    <Link href={href} className="flex min-w-0 items-center gap-3">
      <ProductThumbnail product={product} />
      <div className="min-w-0">
        <p className="font-semibold break-words text-text hover:text-action">{product.name}</p>
        {subtitle ? <p className="text-xs break-words text-text-muted">{subtitle}</p> : null}
      </div>
    </Link>
  );
}

function ProductPrice({ product }: ProductPartProps) {
  const prices = product.variants.map((variant) => variant.pricePoisha);
  const minimum = Math.min(...prices),
    maximum = Math.max(...prices);
  if (maximum === 0) return <span className="font-medium text-danger">No price</span>;
  return (
    <div className="space-y-0.5">
      <span className="font-semibold text-text">
        {minimum === maximum
          ? formatMoney(minimum)
          : `${formatMoney(minimum)}–${formatMoney(maximum)}`}
      </span>
      {product.compareAtPricePoisha !== null ? (
        <del className="block text-xs text-text-muted">
          {formatMoney(product.compareAtPricePoisha)}
        </del>
      ) : null}
    </div>
  );
}

function stockBadgeVariant(available: number): 'danger' | 'warning' | 'neutral' {
  if (available <= 0) return 'danger';
  if (available <= 3) return 'warning';
  return 'neutral';
}

function variantStockColorClass(available: number) {
  if (available <= 0) return 'bg-danger-soft text-danger border-border hover:bg-danger-soft/80';
  if (available <= 3) return 'bg-warning-soft text-warning border-border hover:bg-warning-soft/80';
  return 'bg-surface-muted text-text border-border hover:bg-surface-muted/80';
}

type ProductStockProps = ProductPartProps & Pick<ProductListProps, 'onAdjust'>;

function ProductStock({ product, onAdjust }: ProductStockProps) {
  if (!product.isStockTracked) return <p className="text-sm text-text-muted">Not tracked</p>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {product.variants.map((variant) => {
        const colorClass = variantStockColorClass(variant.available);
        return onAdjust ? (
          <Button
            key={variant.id}
            variant="secondary"
            className={cn(
              'h-7 min-h-7 max-w-full rounded-md border px-2 py-0.5 text-xs font-medium wrap-anywhere tabular-nums',
              colorClass,
            )}
            aria-label={`Adjust stock for ${product.name}, ${variant.title}`}
            onClick={() => onAdjust(variant.id)}
          >
            {variant.title}: {variant.available}
          </Button>
        ) : (
          <Badge
            key={variant.id}
            variant={stockBadgeVariant(variant.available)}
            className="h-7 min-h-7 max-w-full rounded-md border border-border px-2 py-0.5 text-xs font-medium wrap-anywhere tabular-nums"
          >
            {variant.title}: {variant.available}
          </Badge>
        );
      })}
    </div>
  );
}
