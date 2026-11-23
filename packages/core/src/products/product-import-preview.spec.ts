import { describe, expect, it } from 'vitest';

import { type ImportProduct, ProductImportService } from './product-import.service';
import type { SkuMatch } from './sku-match.repository';

const current: SkuMatch['current'] = {
  pricePoisha: 225000,
  costPoisha: 100000,
  onHand: 12,
  isStockTracked: true,
  category: 'Clothing',
  description: null,
  status: 'active',
};

function match(sku: string, productId: string, rest: Partial<SkuMatch> = {}): SkuMatch {
  return { id: `v-${sku}`, productId, sku, isArchived: false, current, ...rest };
}

function preview(matches: SkuMatch[], products: ImportProduct[], mode: 'update' | 'skip') {
  const repository = { findVariantsBySku: async () => matches };
  const service = new ProductImportService(
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return service.preview('store', products, mode);
}

function product(variants: { sku: string | null; onHand?: number }[], rest = {}): ImportProduct {
  return {
    name: 'Panjabi',
    category: null,
    description: null,
    status: undefined,
    pricePoisha: 225000,
    options: [],
    variants: variants.map(({ sku, onHand }, index) => ({
      rowNumber: index + 2,
      sku,
      optionValues: {},
      priceOverridePoisha: null,
      costPoisha: null,
      onHand,
    })),
    ...rest,
  };
}

describe('product import dry run', () => {
  it('calls a row with a new sku added', async () => {
    expect(await preview([], [product([{ sku: 'NEW-1' }, { sku: null }])], 'update')).toEqual([
      { rowNumber: 2, result: 'added', problem: null, wasPricePoisha: null },
      { rowNumber: 3, result: 'added', problem: null, wasPricePoisha: null },
    ]);
  });

  it('says what changed and the price it was, and skips a row with nothing new', async () => {
    const matches = [match('P-M', 'p1'), match('P-L', 'p1')];
    const rows = await preview(
      matches,
      [
        product(
          [
            { sku: 'P-M', onHand: 12 },
            { sku: 'P-L', onHand: 5 },
          ],
          { pricePoisha: 245000 },
        ),
      ],
      'update',
    );
    expect(rows).toEqual([
      { rowNumber: 2, result: 'changed', problem: null, wasPricePoisha: 225000 },
      { rowNumber: 3, result: 'changed', problem: null, wasPricePoisha: 225000 },
    ]);
    const same = await preview(matches, [product([{ sku: 'P-M', onHand: 12 }])], 'update');
    expect(same).toEqual([
      { rowNumber: 2, result: 'skipped', problem: 'Nothing to change', wasPricePoisha: null },
    ]);
  });

  it('never counts a blank cell as a change, and ignores a count for an untracked product', async () => {
    const untracked = match('P-M', 'p1', { current: { ...current, isStockTracked: false } });
    const [row] = await preview([untracked], [product([{ sku: 'P-M', onHand: 99 }])], 'update');
    expect(row?.result).toBe('skipped');
    const [blank] = await preview([match('P-M', 'p1')], [product([{ sku: 'P-M' }])], 'update');
    expect(blank?.result).toBe('skipped');
  });

  it('skips matched rows in skip mode and rejects sizes it cannot match', async () => {
    const rows = await preview(
      [match('P-M', 'p1')],
      [product([{ sku: 'P-M' }, { sku: 'P-XL' }])],
      'update',
    );
    expect(rows[1]).toMatchObject({ result: 'rejected' });
    const [skipped] = await preview([match('P-M', 'p1')], [product([{ sku: 'P-M' }])], 'skip');
    expect(skipped?.result).toBe('skipped');
  });
});
