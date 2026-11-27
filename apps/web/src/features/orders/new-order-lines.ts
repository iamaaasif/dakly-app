import { useState } from 'react';

import type { OrderCatalogueProduct } from '@dakly/contracts/orders';

export type OrderLine = {
  variantId: string;
  productName: string;
  // Empty for a product with one variant.
  variantTitle: string;
  photoUrl: string | null;
  unitPricePoisha: number;
  // Null when the product does not track stock, so there is no limit.
  available: number | null;
  quantity: number;
};

export type OrderLineChange = { lines: OrderLine[]; stopped?: 'out_of_stock' | 'stock_limit' };

export function lineFromVariant(
  product: OrderCatalogueProduct,
  variantId: string,
): OrderLine | undefined {
  const variant = product.variants.find(({ id }) => id === variantId);
  if (!variant || variant.pricePoisha <= 0) return undefined;
  return {
    variantId,
    productName: product.name,
    variantTitle: variant.isDefault ? '' : variant.title,
    photoUrl: variant.photoUrl,
    unitPricePoisha: variant.pricePoisha,
    available: product.isStockTracked ? variant.available : null,
    quantity: 1,
  };
}

export function isOutOfStock(available: number | null): boolean {
  return available !== null && available <= 0;
}

// The server refuses a line above the stock, so the stepper stops at it instead.
export function clampQuantity(line: OrderLine, wanted: number): number {
  const most = line.available ?? Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.min(Math.floor(wanted), most, 100_000));
}

export function addLine(lines: OrderLine[], line: OrderLine): OrderLineChange {
  if (isOutOfStock(line.available)) return { lines, stopped: 'out_of_stock' };
  const same = lines.find(({ variantId }) => variantId === line.variantId);
  if (!same) return { lines: [...lines, line] };
  const quantity = clampQuantity(same, same.quantity + 1);
  if (quantity === same.quantity) return { lines, stopped: 'stock_limit' };
  return { lines: lines.map((one) => (one === same ? { ...one, quantity } : one)) };
}

function stoppedMessage(line: OrderLine, stopped: OrderLineChange['stopped']): string | undefined {
  if (stopped === 'out_of_stock') return `${line.productName} is out of stock`;
  if (stopped === 'stock_limit') return `Only ${line.available} of ${line.productName} in stock`;
  return undefined;
}

export function useOrderLines() {
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [notice, setNotice] = useState<string>();
  function add(line: OrderLine) {
    const change = addLine(lines, line);
    setLines(change.lines);
    setNotice(stoppedMessage(line, change.stopped));
  }
  function setQuantity(variantId: string, wanted: number) {
    setLines(
      lines.map((line) =>
        line.variantId === variantId ? { ...line, quantity: clampQuantity(line, wanted) } : line,
      ),
    );
    setNotice(undefined);
  }
  function remove(variantId: string) {
    setLines(lines.filter((line) => line.variantId !== variantId));
  }
  // The index lets Undo put the line back where it was.
  function restore(line: OrderLine, index: number) {
    // Undo runs from a toast made earlier, so it must read the lines as they are now.
    setLines((now) =>
      now.some((one) => one.variantId === line.variantId)
        ? now
        : [...now.slice(0, index), line, ...now.slice(index)],
    );
  }
  return {
    lines,
    notice,
    add,
    setQuantity,
    remove,
    restore,
    dismissNotice: () => setNotice(undefined),
  };
}
