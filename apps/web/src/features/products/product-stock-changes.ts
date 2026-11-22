import type { ProductFormValues, ProductResponse } from '@dakly/contracts/products';

import type { GridVariant } from './product-variant-grid';

export type StockChange = { variantId: string; label: string; quantity: number };

function onHandBefore(previous: ProductResponse | undefined, id: string): number {
  return previous?.variants.find((variant) => variant.id === id)?.onHand ?? 0;
}

// A grid row is a saved variant by id, or a new one by its option values.
function savedVariantFor(
  row: GridVariant,
  saved: ProductResponse,
  optionNames: string[],
): ProductResponse['variants'][number] | undefined {
  if (row.id) return saved.variants.find((variant) => variant.id === row.id);
  return saved.variants.find((variant) =>
    optionNames.every(
      (name, position) => variant.optionValues[name] === row.optionValues?.[position],
    ),
  );
}

// What to write to the stock history after the product is saved: the difference from what the
// shop had, never the typed number itself.
export function stockChanges(
  saved: ProductResponse,
  values: Pick<ProductFormValues, 'options' | 'variants'>,
  previous?: ProductResponse,
): StockChange[] {
  const optionNames = (values.options ?? []).map(({ name }) => name.trim());
  return (values.variants ?? []).flatMap((row) => {
    const variant = savedVariantFor(row, saved, optionNames);
    if (!variant) return [];
    const quantity = (Number(row.initialStock) || 0) - onHandBefore(previous, variant.id);
    const label =
      optionNames
        .map((_, position) => row.optionValues?.[position])
        .filter(Boolean)
        .join(' / ') || variant.title;
    return quantity === 0 ? [] : [{ variantId: variant.id, label, quantity }];
  });
}

export function hasStockEdits(
  values: Pick<ProductFormValues, 'variants'>,
  previous: ProductResponse,
): boolean {
  return (values.variants ?? []).some((row) => {
    const typed = Number(row.initialStock) || 0;
    return typed !== (row.id ? onHandBefore(previous, row.id) : 0);
  });
}

type AdjustStock = (args: {
  variantId: string;
  input: { quantity: number; reason: string };
}) => Promise<unknown>;

// Returns the labels of the variants whose stock could not be written, so the page can say so.
export async function writeStockChanges(
  changes: StockChange[],
  reason: string,
  adjustStock: AdjustStock,
): Promise<string[]> {
  const results = await Promise.allSettled(
    changes.map(({ variantId, quantity }) =>
      adjustStock({ variantId, input: { quantity, reason } }),
    ),
  );
  return changes.flatMap(({ label }, index) =>
    results[index]?.status === 'rejected' ? [label] : [],
  );
}
