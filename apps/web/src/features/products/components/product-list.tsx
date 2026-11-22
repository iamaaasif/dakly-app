import Link from 'next/link';

import { formatMoney } from '@dakly/contracts/money';
import type { ProductResponse } from '@dakly/contracts/products';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import { firstVariantProfitPercent, productPriceRange } from '../product-prices';
import { ProductReadiness } from './product-readiness';
import { ProductThumbnail } from './product-thumbnail';

export type ProductSelection = {
  selectedIds: ReadonlySet<string>;
  onToggle: (product: ProductResponse) => void;
  onTogglePage: (products: ProductResponse[], selected: boolean) => void;
};
type ProductListProps = {
  products: ProductResponse[];
  onAdjust?: (variantId: string) => void;
  onChangeStock?: (productId: string) => void;
  selection?: ProductSelection;
};

export function ProductList({ products, onAdjust, onChangeStock, selection }: ProductListProps) {
  return (
    <>
      <div className="hidden md:block [&>div]:rounded-t-none [&>div]:border-t-0">
        <ProductTable
          products={products}
          onAdjust={onAdjust}
          onChangeStock={onChangeStock}
          selection={selection}
        />
      </div>
      <ProductCards
        products={products}
        onAdjust={onAdjust}
        onChangeStock={onChangeStock}
        selection={selection}
      />
    </>
  );
}

function SelectProduct({
  product,
  selection,
}: { product: ProductResponse } & Pick<ProductListProps, 'selection'>) {
  if (!selection) return null;
  return (
    <Checkbox
      aria-label={`Select ${product.name}`}
      checked={selection.selectedIds.has(product.id)}
      onCheckedChange={() => selection.onToggle(product)}
    />
  );
}

function lowestStockVariant(variants: ProductResponse['variants']) {
  const first = variants[0];
  if (!first) return undefined;
  return variants.reduce((lowest, v) => (v.available < lowest.available ? v : lowest), first);
}

type ProductRestockButtonProps = {
  product: ProductResponse;
  onAdjust?: (variantId: string) => void;
  onChangeStock?: (productId: string) => void;
  className?: string;
};

function ProductRestockButton({
  product,
  onAdjust,
  onChangeStock,
  className,
}: ProductRestockButtonProps) {
  if (!onAdjust || !product.isStockTracked) return null;
  const variant = lowestStockVariant(product.variants);
  if (!variant) return null;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        variant="secondary"
        className={className}
        aria-label={`Restock ${product.name}`}
        onClick={() => onAdjust(variant.id)}
      >
        + Restock
      </Button>
      {onChangeStock ? (
        <Button
          variant="secondary"
          className={className}
          aria-label={`Change stock for ${product.name}`}
          onClick={() => onChangeStock(product.id)}
        >
          Change stock
        </Button>
      ) : null}
    </div>
  );
}

function ProductTableHead({ products, onAdjust, selection }: ProductListProps) {
  const allSelected = products.every((product) => selection?.selectedIds.has(product.id));
  return (
    <TableHeader>
      <TableRow>
        {selection ? (
          <TableHead className="w-10">
            <Checkbox
              aria-label="Select all products on this page"
              checked={allSelected}
              onCheckedChange={(checked) => selection.onTogglePage(products, checked === true)}
            />
          </TableHead>
        ) : null}
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
  );
}

function ProductTable({ products, onAdjust, onChangeStock, selection }: ProductListProps) {
  return (
    <Table aria-label="Products">
      <ProductTableHead
        products={products}

        onAdjust={onAdjust}
        selection={selection}
      />
      <TableBody>
        {products.map((product) => (
          <TableRow key={product.id}>
            {selection ? (
              <TableCell>
                <SelectProduct product={product} selection={selection} />
              </TableCell>
            ) : null}
            <TableCell>
              <ProductIdentity product={product} />
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
                <ProductRestockButton
                  product={product}
                  onAdjust={onAdjust}
                  onChangeStock={onChangeStock}
                  className="h-8 min-h-8 rounded-md px-3 text-xs font-medium"
                />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ProductCards({ products, onAdjust, onChangeStock, selection }: ProductListProps) {
  return (
    <ul aria-label="Products" className="space-y-3 md:hidden">
      {products.map((product) => (
        <li key={product.id} className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <SelectProduct product={product} selection={selection} />
            <ProductIdentity product={product} />
            <div className="shrink-0 text-right tabular-nums">
              <ProductPrice product={product} />
            </div>
          </div>
          <ProductStock product={product} onAdjust={onAdjust} />
          <div className="flex items-center justify-between gap-2 pt-1">
            <ProductReadiness product={product} />
            <ProductRestockButton
              product={product}
              onAdjust={onAdjust}
              onChangeStock={onChangeStock}
              className="min-h-11 rounded-md px-4 text-sm font-medium"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

type ProductPartProps = { product: ProductResponse };

function ProductIdentity({ product }: ProductPartProps) {
  const href = `/products/${product.id}`;
  const code = product.variants.find((v) => v.sku)?.sku;
  const subtitle = [product.category, code].filter(Boolean).join(' · ');
  return (
    <Link href={href} aria-label={product.name} className="flex min-w-0 items-center gap-3">
      <ProductThumbnail product={product} />
      <div className="min-w-0">
        <p className="font-semibold break-words text-text hover:text-action">{product.name}</p>
        {subtitle ? <p className="text-xs break-words text-text-muted">{subtitle}</p> : null}
      </div>
    </Link>
  );
}

function ProductPrice({ product }: ProductPartProps) {
  const price = productPriceRange(product);
  if (!price) return <span className="font-medium text-danger">No price</span>;
  const profit = firstVariantProfitPercent(product);
  return (
    <div className="space-y-0.5">
      <span className="font-semibold text-text">{price}</span>
      {product.compareAtPricePoisha !== null ? (
        <del className="block text-xs text-text-muted">
          {formatMoney(product.compareAtPricePoisha)}
        </del>
      ) : null}
      {profit ? <span className="block text-xs font-medium text-success">{profit}</span> : null}
    </div>
  );
}

function stockBadgeVariant(available: number): 'danger' | 'neutral' {
  if (available <= 0) return 'danger';
  return 'neutral';
}

function variantStockColorClass(available: number) {
  if (available <= 0) return 'bg-danger-soft text-danger border-border hover:bg-danger-soft/80';
  return 'bg-surface-muted text-text border-border hover:bg-surface-muted/80';
}

type ProductStockProps = ProductPartProps & Pick<ProductListProps, 'onAdjust'>;

function ProductStock({ product, onAdjust }: ProductStockProps) {
  if (!product.isStockTracked) {
    return <p className="text-sm text-text-muted">Not tracked</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {product.variants.map((variant) => {
        const label = `${variant.title} ${variant.available}`;
        return onAdjust ? (
          <Button
            key={variant.id}
            variant="secondary"
            className={cn(
              'min-h-11 max-w-full rounded-md border px-3 py-2 text-sm font-medium wrap-anywhere tabular-nums md:h-7 md:min-h-7 md:px-2 md:py-0.5 md:text-xs',
              variantStockColorClass(variant.available),
            )}
            aria-label={`Adjust stock for ${product.name}, ${variant.title}`}
            onClick={() => onAdjust(variant.id)}
          >
            {label}
          </Button>
        ) : (
          <Badge
            key={variant.id}
            variant={stockBadgeVariant(variant.available)}
            className="min-h-11 max-w-full rounded-md border border-border px-3 py-2 text-sm font-medium wrap-anywhere tabular-nums md:h-7 md:min-h-7 md:px-2 md:py-0.5 md:text-xs"
          >
            {label}
          </Badge>
        );
      })}
    </div>
  );
}
