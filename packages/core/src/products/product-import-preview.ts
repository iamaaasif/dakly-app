import type { ImportDuplicateMode } from '@dakly/contracts/contacts';

import type { ImportProduct, ImportVariant } from './product-import-types';
import type { SkuMatch } from './sku-match.repository';

export type PreviewedRow = {
  rowNumber: number;
  result: 'added' | 'changed' | 'skipped' | 'rejected';
  problem: string | null;
  wasPricePoisha: number | null;
};

const row = (
  rowNumber: number,
  result: PreviewedRow['result'],
  problem: string | null = null,
  wasPricePoisha: number | null = null,
): PreviewedRow => ({ rowNumber, result, problem, wasPricePoisha });

export function matchProblem(match: SkuMatch | undefined, targetProductId: string | undefined) {
  if (!match) return 'A size of an existing product needs a SKU that is already in the shop';
  if (match.productId !== targetProductId) return 'These SKUs belong to different products';
  if (match.isArchived) return 'This SKU belongs to an archived product';
  return undefined;
}

export function previewRows(
  batch: ImportProduct[],
  matches: Map<string, SkuMatch>,
  duplicateMode: ImportDuplicateMode,
): PreviewedRow[] {
  return batch.flatMap((product) => {
    const target = product.variants.flatMap(({ sku }) => (sku ? (matches.get(sku) ?? []) : []))[0]
      ?.productId;
    return product.variants.map((variant) => {
      if (target === undefined) return row(variant.rowNumber, 'added');
      const match = variant.sku ? matches.get(variant.sku) : undefined;
      const problem = matchProblem(match, target);
      if (problem) return row(variant.rowNumber, 'rejected', problem);
      if (duplicateMode === 'skip') return row(variant.rowNumber, 'skipped');
      return changePreview(product, variant, match!);
    });
  });
}

// Mirrors what the update writes: only non-blank cells count.
function changePreview(
  product: ImportProduct,
  variant: ImportVariant,
  { current }: SkuMatch,
): PreviewedRow {
  const price = variant.priceOverridePoisha ?? product.pricePoisha;
  const priceChanged = price > 0 && price !== current.pricePoisha;
  const changed = priceChanged || otherFieldsChanged(product, variant, current);
  return row(
    variant.rowNumber,
    changed ? 'changed' : 'skipped',
    changed ? null : 'Nothing to change',
    priceChanged ? current.pricePoisha : null,
  );
}

function otherFieldsChanged(
  product: ImportProduct,
  variant: ImportVariant,
  current: SkuMatch['current'],
): boolean {
  // A product that does not track stock ignores the count.
  const stock =
    current.isStockTracked && variant.onHand !== undefined && variant.onHand !== current.onHand;
  const differs = <T>(value: T | null | undefined, stored: T | null) =>
    value !== null && value !== undefined && value !== stored;
  return (
    stock ||
    differs(variant.costPoisha, current.costPoisha) ||
    differs(product.category, current.category) ||
    differs(product.description, current.description) ||
    differs(product.status, current.status)
  );
}
