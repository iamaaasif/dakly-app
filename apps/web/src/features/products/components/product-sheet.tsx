'use client';
import { Pencil, X } from 'lucide-react';
import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import type { ProductResponse } from '@dakly/contracts/products';
import { Badge } from '@dakly/ui/badge';
import { Button } from '@dakly/ui/button';
import { cn } from '@dakly/ui/cn';
import { QueryError } from '@dakly/ui/query-error';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@dakly/ui/tabs';

import { useChangeProduct } from '../api/change-product';
import { useGetProduct } from '../api/get-product';
import { ProductForm } from './product-form';
import { ProductPhotos } from './product-photos';
import { ProductThumbnail } from './product-thumbnail';
import { ProductsLoading } from './products-loading';
import { SessionInteraction } from '@/components/session-interaction';
import { formatMoney } from '@/lib/format-money';
import { useSessionContext } from '@/lib/session-context';

type ProductSheetProps = { productId: string; onClose: () => void };

export function ProductSheet({ productId, onClose }: ProductSheetProps) {
  const { data, error, isPending, refetch } = useGetProduct(productId);
  const blocked = useContext(SessionInteraction);
  const element = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = element.current;
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    const dialog = element.current;
    if (!blocked) dialog?.showModal();
    else dialog?.close();
  }, [blocked]);

  return (
    <dialog
      ref={element}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onKeyDown={trapFocus}
      className="fixed inset-y-0 right-0 left-auto z-50 m-0 flex h-dvh w-full max-w-md flex-col overflow-y-auto border-y-0 border-r-0 border-l border-border bg-surface p-6 text-text shadow-overlay backdrop:bg-inverse/50"
    >
      {error ? (
        <SheetFeedback titleId={titleId} onClose={onClose}>
          <QueryError
            message={error.message}
            onRetry={() => refetch()}
            retryLabel="Retry product"
          />
        </SheetFeedback>
      ) : null}
      {isPending ? (
        <SheetFeedback titleId={titleId} onClose={onClose}>
          <ProductsLoading />
        </SheetFeedback>
      ) : null}
      {data ? <ProductDetails product={data} titleId={titleId} onClose={onClose} /> : null}
    </dialog>
  );
}

function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const elements = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
    ),
  ).filter((el) => el.getClientRects().length);
  const first = elements[0],
    last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

function SheetFeedback({
  titleId,
  onClose,
  children,
}: {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          variant="secondary"
          className="size-8 min-h-8 min-w-8 p-0"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      <h2 id={titleId} className="sr-only">
        Product
      </h2>
      {children}
    </>
  );
}

type ProductDetailsProps = {
  product: ProductResponse;
  titleId: string;
  onClose: () => void;
};

function ProductDetails({ product, titleId, onClose }: ProductDetailsProps) {
  const change = useChangeProduct(product.id);
  const { data: session } = useSessionContext();
  const [editing, setEditing] = useState(false);
  const canEdit = session?.currentStore?.canEditProducts ?? false;

  return (
    <div className="space-y-6">
      <ProductDetailHeader
        product={product}
        titleId={titleId}
        canEdit={canEdit && !editing}
        onEdit={() => setEditing(true)}
        onClose={onClose}
      />
      {editing && canEdit ? (
        <ProductForm
          product={product}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <ProductTabs product={product} change={change} canEdit={canEdit} />
      )}
      {change.error ? (
        <p role="alert" className="text-danger">
          {change.error.message}
        </p>
      ) : null}
    </div>
  );
}

function priceRange(min: number, max: number): string {
  if (min === max) return formatMoney(min);
  return `${formatMoney(min)}–${formatMoney(max)}`;
}

function getProductHeaderStatus(product: ProductResponse) {
  const prices = product.variants.map((v) => v.pricePoisha);
  const maxPrice = prices.length ? Math.max(...prices) : product.pricePoisha;
  if (maxPrice === 0 || product.readiness.includes('needs_price')) {
    return { priceText: 'No price', badgeLabel: 'Needs a price', badgeVariant: 'danger' as const };
  }
  const minPrice = Math.min(...prices);
  const priceText = priceRange(minPrice, maxPrice);
  if (product.readiness.includes('running_low')) {
    return { priceText, badgeLabel: 'Running low', badgeVariant: 'warning' as const };
  }
  if (product.status === 'hidden') {
    return { priceText, badgeLabel: 'Hidden', badgeVariant: 'neutral' as const };
  }
  return { priceText, badgeLabel: 'Selling', badgeVariant: 'success' as const };
}

type ProductDetailHeaderProps = {
  product: ProductResponse;
  titleId: string;
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
};

function ProductDetailHeader(props: ProductDetailHeaderProps) {
  const { product, titleId, canEdit, onEdit, onClose } = props;
  const status = getProductHeaderStatus(product);

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ProductThumbnail product={product} />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-semibold wrap-anywhere text-text">
            {product.name}
          </h2>
          {product.category ? (
            <p className="text-xs wrap-anywhere text-text-muted">{product.category}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'text-sm font-semibold tabular-nums',
                status.badgeVariant === 'danger' ? 'text-danger' : 'text-text',
              )}
            >
              {status.priceText}
            </span>
            <Badge
              variant={status.badgeVariant}
              className="rounded-full px-2 py-0.5 text-xs font-medium"
            >
              {status.badgeLabel}
            </Badge>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canEdit ? (
          <Button
            variant="secondary"
            onClick={onEdit}
            className="h-8 min-h-8 px-2.5 text-xs font-medium"
            aria-label="Edit product"
          >
            <Pencil size={13} aria-hidden="true" />
            Edit
          </Button>
        ) : null}
        <Button
          variant="secondary"
          className="size-8 min-h-8 min-w-8 p-0"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

type ProductTabsProps = {
  product: ProductResponse;
  change: ReturnType<typeof useChangeProduct>;
  canEdit: boolean;
};

function ProductTabs({ product, change, canEdit }: ProductTabsProps) {
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="stock">Stock</TabsTrigger>
        <TabsTrigger value="sales">Sales</TabsTrigger>
        <TabsTrigger value="customers">Customers</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="space-y-6 pt-0">
        <ProductOverview product={product} change={change} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="stock" className="space-y-4 pt-0">
        <ProductStockBreakdown product={product} />
      </TabsContent>
      <TabsContent value="sales" className="space-y-2 pt-0">
        <p className="text-sm text-text-muted">
          Sales history will appear here once analytics is enabled.
        </p>
      </TabsContent>
      <TabsContent value="customers" className="space-y-2 pt-0">
        <p className="text-sm text-text-muted">
          Customer insights will appear here once analytics is enabled.
        </p>
      </TabsContent>
    </Tabs>
  );
}

function ProductStockBreakdown({ product }: { product: ProductResponse }) {
  if (!product.isStockTracked) {
    return <p className="text-sm text-text-muted">Not tracked</p>;
  }
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-text">Stock</h3>
      <div className="space-y-2">
        {product.variants.map((v) => (
          <div
            key={v.id}
            className="space-y-1 rounded-lg border border-border bg-surface-muted p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text">{v.title}</span>
              {v.sku ? <span className="text-xs text-text-muted">SKU: {v.sku}</span> : null}
            </div>
            <p className="text-xs text-text-muted">
              <span className="font-semibold text-text tabular-nums">{v.available}</span> available
              · {v.reserved} reserved · {v.onHand} on hand
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function computeCostAndProfit(product: ProductResponse, minPrice: number) {
  const costs = product.variants
    .map((v) => v.costPoisha)
    .filter((c): c is number => c !== null && c > 0);
  const minCost = costs.length ? Math.min(...costs) : null;
  const maxCost = costs.length ? Math.max(...costs) : null;
  const cost = minCost !== null && maxCost !== null ? priceRange(minCost, maxCost) : 'Not set';
  const profit = minCost !== null && minPrice > minCost ? formatMoney(minPrice - minCost) : '—';
  return { cost, profit };
}

function computePriceTiles(product: ProductResponse) {
  const prices = product.variants.map((v) => v.pricePoisha);
  const minPrice = prices.length ? Math.min(...prices) : product.pricePoisha;
  const maxPrice = prices.length ? Math.max(...prices) : product.pricePoisha;
  const sellingPrice = maxPrice > 0 ? priceRange(minPrice, maxPrice) : 'Not set';
  const { cost, profit } = computeCostAndProfit(product, minPrice);
  const totalAvailable = product.variants.reduce((total, v) => total + v.available, 0);

  return {
    sellingPrice,
    cost,
    profit,
    inStock: product.isStockTracked ? `${totalAvailable} available` : 'Not tracked',
    lowStockAlert: 'At 2 or fewer',
  };
}

function PriceTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5 rounded-lg border border-border bg-surface-muted p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm font-semibold text-text tabular-nums">{value}</p>
    </div>
  );
}

type ProductOverviewProps = {
  product: ProductResponse;
  change: ReturnType<typeof useChangeProduct>;
  canEdit: boolean;
};

function ProductOverview({ product, change, canEdit }: ProductOverviewProps) {
  const tiles = computePriceTiles(product);

  return (
    <>
      <ProductPhotos product={product} />
      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold text-text">Description</h3>
        <p className="text-sm wrap-anywhere whitespace-pre-wrap text-text-muted">
          {product.description || "No description yet. It's used in posts and your order link."}
        </p>
      </section>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <PriceTile label="Selling price" value={tiles.sellingPrice} />
          <PriceTile label="Your cost" value={tiles.cost} />
          <PriceTile label="Profit each" value={tiles.profit} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PriceTile label="In stock" value={tiles.inStock} />
          <PriceTile label="Low stock alert" value={tiles.lowStockAlert} />
        </div>
      </div>
      {canEdit ? (
        <div className="pt-2">
          <button
            type="button"
            disabled={change.isPending}
            className="text-sm text-text-muted underline hover:text-text disabled:opacity-50"
            onClick={() =>
              change.mutate({ status: product.status === 'hidden' ? 'active' : 'hidden' })
            }
          >
            {product.status === 'hidden' ? 'Show product' : 'Hide product'}
          </button>
        </div>
      ) : null}
    </>
  );
}
