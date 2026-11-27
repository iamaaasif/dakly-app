import { Pencil, Plus, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';

import { formatMoney } from '@dakly/contracts/money';
import type { ProductListItem, ProductResponse, ProductReadiness } from '@dakly/contracts/products';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { Checkbox } from '@dakly/ui/checkbox';
import { cn } from '@dakly/ui/cn';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@dakly/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dakly/ui/table';

import type { ProductColumn } from '../product-columns';
import { readinessLabels } from '../product-labels';
import { firstVariantProfitPercent, productPriceRange } from '../product-prices';
import { ProductActionsMenu } from './product-actions-menu';
import { ProductThumbnail } from './product-thumbnail';

export type ProductSelection = {
  selectedIds: ReadonlySet<string>;
  onToggle: (product: ProductResponse) => void;
  onTogglePage: (products: ProductResponse[], selected: boolean) => void;
  onProductChanged: (productId: string, saved: ProductResponse | null) => void;
};
type ProductListProps = {
  products: ProductListItem[];
  columns: ProductColumn[];
  readiness?: ProductReadiness;
  onReadiness: (readiness: ProductReadiness | undefined) => void;
  onAdjust?: (variantId: string) => void;
  onChangeStock?: (productId: string) => void;
  selection?: ProductSelection;
};
type RowProps = Omit<ProductListProps, 'products' | 'readiness' | 'onReadiness'> & {
  product: ProductListItem;
};

const readinessFilters: ProductReadiness[] = [
  'running_low',
  'out_of_stock',
  'needs_price',
  'needs_photo',
  'hidden',
];

export function ProductList(props: ProductListProps) {
  const { products } = props;
  return (
    <>
      <div className="hidden md:block">
        <Table bare aria-label="Products">
          <ProductTableHead {...props} />
          <TableBody>
            {products.map((product) => (
              <ProductRow key={product.id} product={product} {...props} />
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Products" className="divide-y divide-border md:hidden">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} {...props} />
        ))}
      </ul>
    </>
  );
}

const headClass = 'text-xs font-semibold tracking-wide text-text-muted uppercase';

function ProductTableHead({
  products,
  columns,
  readiness,
  onReadiness,
  onAdjust,
  selection,
}: ProductListProps) {
  const allSelected = products.every((product) => selection?.selectedIds.has(product.id));
  return (
    <TableHeader>
      <TableRow>
        {selection ? (
          <TableHead className="w-12 pl-4">
            <Checkbox
              aria-label="Select all products on this page"
              checked={allSelected}
              onCheckedChange={(checked) => selection.onTogglePage(products, checked === true)}
            />
          </TableHead>
        ) : null}
        <TableHead className={headClass}>Product</TableHead>
        {columns.includes('price') ? <TableHead className={headClass}>Price</TableHead> : null}
        {columns.includes('stock') ? <TableHead className={headClass}>Stock</TableHead> : null}
        {columns.includes('status') ? (
          <TableHead className={headClass}>
            <ReadinessFilter readiness={readiness} onReadiness={onReadiness} />
          </TableHead>
        ) : null}
        {onAdjust ? (
          <TableHead className={cn(headClass, 'pr-4 text-right whitespace-nowrap')}>
            Actions
          </TableHead>
        ) : null}
      </TableRow>
    </TableHeader>
  );
}

// The readiness chips moved here from the page: the column the person already reads as "state".
function ReadinessFilter({
  readiness,
  onReadiness,
}: Pick<ProductListProps, 'readiness' | 'onReadiness'>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Filter products by status"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          readiness && 'text-action',
        )}
      >
        Status
        <SlidersHorizontal aria-hidden="true" size={12} strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuCheckboxItem
          checked={!readiness}
          onCheckedChange={() => onReadiness(undefined)}
        >
          All products
        </DropdownMenuCheckboxItem>
        {readinessFilters.map((each) => (
          <DropdownMenuCheckboxItem
            key={each}
            checked={readiness === each}
            onCheckedChange={() => onReadiness(each)}
          >
            {readinessLabels[each]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SelectProduct({ product, selection }: Pick<RowProps, 'product' | 'selection'>) {
  if (!selection) return null;
  return (
    <Checkbox
      aria-label={`Select ${product.name}`}
      checked={selection.selectedIds.has(product.id)}
      onCheckedChange={() => selection.onToggle(product)}
    />
  );
}

function ProductRow({ product, columns, onAdjust, onChangeStock, selection }: RowProps) {
  return (
    <TableRow className="h-[72px]">
      {selection ? (
        <TableCell className="w-12 pl-4">
          <SelectProduct product={product} selection={selection} />
        </TableCell>
      ) : null}
      <TableCell>
        <ProductIdentity product={product} />
      </TableCell>
      {columns.includes('price') ? (
        <TableCell>
          <ProductPrice product={product} />
        </TableCell>
      ) : null}
      {columns.includes('stock') ? (
        <TableCell>
          <ProductStock product={product} onAdjust={onAdjust} />
        </TableCell>
      ) : null}
      {columns.includes('status') ? (
        <TableCell>
          <ProductVisibility product={product} />
        </TableCell>
      ) : null}
      {onAdjust ? (
        <TableCell className="pr-4">
          <ProductRowActions
            product={product}
            onAdjust={onAdjust}
            onChangeStock={onChangeStock}
            selection={selection}
          />
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function ProductCard({ product, onAdjust, onChangeStock, selection }: RowProps) {
  return (
    <li className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <SelectProduct product={product} selection={selection} />
        <ProductIdentity product={product} />
        <div className="ml-auto shrink-0 text-right">
          <ProductPrice product={product} />
        </div>
      </div>
      <ProductStock product={product} onAdjust={onAdjust} />
      <div className="flex items-center justify-between gap-2">
        <ProductVisibility product={product} />
        {onAdjust ? (
          <ProductRowActions
            product={product}
            onAdjust={onAdjust}
            onChangeStock={onChangeStock}
            selection={selection}
          />
        ) : null}
      </div>
    </li>
  );
}

function lowestStockVariant(variants: ProductResponse['variants']) {
  const first = variants[0];
  if (!first) return undefined;
  return variants.reduce((lowest, v) => (v.available < lowest.available ? v : lowest), first);
}

function ProductRowActions({
  product,
  onAdjust,
  onChangeStock,
  selection,
}: Pick<RowProps, 'product' | 'onAdjust' | 'onChangeStock' | 'selection'>) {
  const variant = product.isStockTracked ? lowestStockVariant(product.variants) : undefined;
  return (
    <div className="flex items-center justify-end gap-3">
      {variant && onAdjust ? (
        <Button
          variant="secondary"
          size="sm"
          className="gap-1 px-3 font-semibold whitespace-nowrap"
          aria-label={`Restock ${product.name}`}
          onClick={() => onAdjust(variant.id)}
        >
          <Plus aria-hidden="true" size={12} strokeWidth={2.5} />
          Restock
        </Button>
      ) : null}
      <Link
        href={`/products/${product.id}`}
        aria-label={`Edit ${product.name}`}
        className="inline-grid size-8 place-items-center rounded-md text-text-secondary hover:bg-neutral-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Pencil aria-hidden="true" size={15} strokeWidth={1.75} />
      </Link>
      <ProductActionsMenu
        product={product}
        onChangeStock={onChangeStock}
        onArchived={() => selection?.onProductChanged(product.id, null)}
        onHidden={(saved) => selection?.onProductChanged(saved.id, saved)}
      />
    </div>
  );
}

type ProductPartProps = { product: ProductListItem };

function ProductVisibility({ product }: ProductPartProps) {
  const active = product.status === 'active';
  return (
    <Badge variant={active ? 'success' : 'neutral'} className="rounded-full px-2.5">
      {active ? 'Active' : 'Draft'}
    </Badge>
  );
}

function ProductIdentity({ product }: ProductPartProps) {
  const subtitle = [product.category, product.code].filter(Boolean).join(' · ');
  return (
    <Link
      href={`/products/${product.id}`}
      aria-label={product.name}
      className="flex min-w-0 items-center gap-3"
    >
      <ProductThumbnail product={product} />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-text">
          <span className="break-words">{product.name}</span>
          {product.source === 'chat' ? (
            <Badge variant="info" size="sm" className="rounded-sm whitespace-nowrap">
              Found in chats
            </Badge>
          ) : null}
        </p>
        {subtitle ? <p className="text-xs break-words text-text-muted">{subtitle}</p> : null}
      </div>
    </Link>
  );
}

function ProductPrice({ product }: ProductPartProps) {
  const price = productPriceRange(product);
  if (!price) return <span className="font-semibold text-danger">No price</span>;
  const profit = firstVariantProfitPercent(product);
  return (
    <div className="space-y-0.5 tabular-nums">
      <p className="font-semibold text-text">{price}</p>
      {product.compareAtPricePoisha !== null ? (
        <del className="block text-xs text-text-muted">
          {formatMoney(product.compareAtPricePoisha)}
        </del>
      ) : null}
      {profit ? <p className="text-xs font-medium text-success">{profit}</p> : null}
    </div>
  );
}

function stockTone(variant: ProductResponse['variants'][number]) {
  if (variant.available <= 0) return 'bg-danger-soft text-danger';
  const low = variant.lowStockThreshold !== null && variant.available <= variant.lowStockThreshold;
  return low ? 'bg-warning-soft text-warning' : 'bg-neutral-soft text-text';
}

function ProductStock({
  product,
  onAdjust,
}: ProductPartProps & Pick<ProductListProps, 'onAdjust'>) {
  const waiting = product.waitingToConfirmCount;
  const chipClass =
    'inline-flex min-h-6 max-w-full items-center rounded-sm px-2 text-xs font-medium wrap-anywhere tabular-nums';
  return (
    <div className="space-y-1.5">
      {product.isStockTracked ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {product.variants.map((variant) => {
            const label = `${variant.title} ${variant.available}`;
            return onAdjust ? (
              <button
                key={variant.id}
                type="button"
                className={cn(
                  chipClass,
                  stockTone(variant),
                  'hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                )}
                aria-label={`Adjust stock for ${product.name}, ${variant.title}`}
                onClick={() => onAdjust(variant.id)}
              >
                {label}
              </button>
            ) : (
              <span key={variant.id} className={cn(chipClass, stockTone(variant))}>
                {label}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-text-muted">Not tracked</p>
      )}
      {waiting > 0 ? (
        <p className="text-xs text-text-muted tabular-nums">{waiting} waiting to confirm</p>
      ) : null}
    </div>
  );
}
