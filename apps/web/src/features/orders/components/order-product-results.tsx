'use client';
import Image from 'next/image';

import { formatMoney } from '@dakly/contracts/money';
import type { OrderCatalogueProduct } from '@dakly/contracts/orders';
import { cn } from '@dakly/ui/cn';
import { Skeleton } from '@dakly/ui/skeleton';

import { isOutOfStock } from '../new-order-lines';

export type Choice = { product: OrderCatalogueProduct; variantId: string; disabled: boolean };

const pricedVariants = (product: OrderCatalogueProduct) =>
  product.variants.filter(({ pricePoisha }) => pricePoisha > 0);

export const optionId = (listId: string, { variantId }: Choice) => `${listId}-${variantId}`;

// Selectable rows in screen order: a product with one variant is a row, a product with several
// offers its variants as chips.
export function choicesOf(products: OrderCatalogueProduct[]): Choice[] {
  return products.flatMap((product) =>
    pricedVariants(product).map(({ id, available }) => ({
      product,
      variantId: id,
      disabled: isOutOfStock(product.isStockTracked ? available : null),
    })),
  );
}

export type ResultStatus = 'loading' | 'error' | 'ready';

type ResultListProps = {
  listId: string;
  products: OrderCatalogueProduct[];
  choices: Choice[];
  active: number;
  searching: boolean;
  status: ResultStatus;
  term: string;
  onActive: (index: number) => void;
  onPick: (choice: Choice) => void;
};

export function ResultList({ products, status, searching, term, ...rest }: ResultListProps) {
  if (status === 'loading') return <ResultsLoading />;
  if (status === 'error')
    return (
      <p role="alert" className="p-3 text-danger">
        Could not load products. Try again.
      </p>
    );
  if (!products.length)
    return (
      <p className="p-3 text-text-muted">
        {searching ? `No product matches “${term}”` : 'No sales yet. Type a product name.'}
      </p>
    );
  return (
    <>
      {!searching && (
        <p className="px-3 pt-2 pb-1 text-xs font-medium text-text-muted uppercase">
          Recently sold
        </p>
      )}
      {products.map((product) => (
        <ProductResult key={product.id} product={product} {...rest} />
      ))}
    </>
  );
}

function ResultsLoading() {
  return (
    <div className="space-y-2 p-3" aria-busy="true">
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-11 w-full" />
      ))}
    </div>
  );
}

type RowProps = Pick<ResultListProps, 'listId' | 'choices' | 'active' | 'onActive' | 'onPick'> & {
  product: OrderCatalogueProduct;
};

function ProductResult(props: RowProps) {
  const variants = pricedVariants(props.product);
  if (!variants.length) return null;
  return variants.length === 1 ? <SingleVariantRow {...props} /> : <ChipsRow {...props} />;
}

function ProductHead({ product }: { product: OrderCatalogueProduct }) {
  const variants = pricedVariants(product);
  const photo = variants.find(({ photoUrl }) => photoUrl)?.photoUrl ?? null;
  const single = variants.length === 1;
  const from = Math.min(...variants.map(({ pricePoisha }) => pricePoisha));
  return (
    <>
      <Thumbnail url={photo} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-text">{product.name}</span>
        <span className="block text-sm text-text-muted tabular-nums">
          {single ? '' : 'From '}
          {formatMoney(from)}
          {single ? stockText(product, variants[0]?.available) : ''}
        </span>
      </span>
    </>
  );
}

function SingleVariantRow({ product, listId, choices, active, onActive, onPick }: RowProps) {
  const choice = choices.find(({ product: one }) => one.id === product.id);
  if (!choice) return null;
  const index = choices.indexOf(choice);
  return (
    <div
      id={optionId(listId, choice)}
      role="option"
      aria-selected={index === active}
      aria-disabled={choice.disabled}
      onMouseMove={() => !choice.disabled && onActive(index)}
      onClick={() => onPick(choice)}
      className={cn(
        'flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0',
        index === active && !choice.disabled && 'bg-surface-hover',
        choice.disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <ProductHead product={product} />
      {choice.disabled && <span className="text-sm text-danger">Out of stock</span>}
    </div>
  );
}

function ChipsRow({ product, listId, choices, active, onActive, onPick }: RowProps) {
  const own = choices.filter(({ product: one }) => one.id === product.id);
  return (
    <div className="border-b border-border px-3 py-2 last:border-b-0">
      <div className="flex items-center gap-3">
        <ProductHead product={product} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2 pl-13">
        {own.map((choice) => {
          const index = choices.indexOf(choice);
          const variant = product.variants.find(({ id }) => id === choice.variantId);
          return (
            <span
              key={choice.variantId}
              id={optionId(listId, choice)}
              role="option"
              aria-selected={index === active}
              aria-disabled={choice.disabled}
              title={choice.disabled ? 'Out of stock' : formatMoney(variant?.pricePoisha ?? 0)}
              onMouseMove={() => !choice.disabled && onActive(index)}
              onClick={() => onPick(choice)}
              className={cn(
                'inline-flex min-h-9 cursor-pointer items-center rounded-full border border-input-border px-3 text-sm',
                index === active && !choice.disabled && 'border-action bg-primary-soft text-action',
                choice.disabled && 'cursor-not-allowed text-text-subtle line-through',
              )}
            >
              {variant?.title}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function stockText(product: OrderCatalogueProduct, available: number | undefined) {
  if (!product.isStockTracked || available === undefined || available <= 0) return '';
  return ` · ${available} in stock`;
}

export function Thumbnail({ url, size = 40 }: { url: string | null; size?: number }) {
  if (!url)
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className="shrink-0 rounded-md bg-neutral-soft"
      />
    );
  return (
    <Image
      src={url}
      alt=""
      width={size}
      height={size}
      unoptimized
      style={{ width: size, height: size }}
      className="shrink-0 rounded-md object-cover"
    />
  );
}
