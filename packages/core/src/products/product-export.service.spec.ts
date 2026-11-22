import { readSheet } from 'read-excel-file/node';
import { describe, expect, it } from 'vitest';

import type { ProductResponse } from '@dakly/contracts/products';

import type { AuditService } from '../audit/audit.service';
import type { Clock } from '../platform/clock';
import type { StoreTransaction } from '../platform/database/store-transaction';
import { ProductExportService } from './product-export.service';
import type { ProductsService } from './products.service';

const actor = { kind: 'user', userId: 'user' } as const;

function variant(sku: string | null, size: string, pricePoisha: number, onHand: number) {
  return {
    sku,
    optionValues: { Size: size },
    pricePoisha,
    costPoisha: 70000,
    onHand,
  };
}
const kurti = {
  id: 'p1',
  name: 'Cotton কুর্তি, premium',
  category: 'Kurti',
  description: '=SUM(1,1)',
  status: 'hidden',
  isStockTracked: true,
  pricePoisha: 120000,
  options: [{ name: 'Size', values: ['M', 'L'] }],
  variants: [variant('KURTI-M', 'M', 120000, 10), variant('KURTI-L', 'L', 125050, 0)],
} as unknown as ProductResponse;
const scarf = {
  id: 'p2',
  name: 'Scarf',
  category: null,
  description: null,
  status: 'active',
  isStockTracked: false,
  pricePoisha: 45000,
  options: [],
  variants: [{ sku: null, optionValues: {}, pricePoisha: 45000, costPoisha: null, onHand: 0 }],
} as unknown as ProductResponse;

function service(items: ProductResponse[], recorded: unknown[] = []) {
  // Two products per page, so the export has to follow the cursor.
  const products = {
    list: async (_store: string, query: { cursor?: string }) => {
      const from = query.cursor ? items.findIndex(({ id }) => id === query.cursor) + 1 : 0;
      const page = items.slice(from, from + 1);
      return { items: page, nextCursor: from + 1 < items.length ? page[0]!.id : null };
    },
  };
  return new ProductExportService(
    products as unknown as ProductsService,
    { record: async (_store: string, entry: unknown) => void recorded.push(entry) } as AuditService,
    { run: (_store: string, work: () => unknown) => work() } as unknown as StoreTransaction,
    { now: () => new Date('2026-11-20T04:00:00Z') } as Clock,
  );
}

describe('product export', () => {
  it('writes one row per variant with option columns, in every page', async () => {
    const file = await service([kurti, scarf]).export('store', { format: 'xlsx' }, actor);
    expect(file.filename).toBe('dakly-products-2026-11-20.xlsx');
    expect(file.rowCount).toBe(3);
    expect(await readSheet(file.body)).toEqual([
      ['Name', 'Price', 'Category', 'Description', 'Status', 'SKU', 'Cost', 'On hand', 'Size'],
      [
        'Cotton কুর্তি, premium',
        '1200.00',
        'Kurti',
        '=SUM(1,1)',
        'hidden',
        'KURTI-M',
        '700.00',
        '10',
        'M',
      ],
      [
        'Cotton কুর্তি, premium',
        '1250.50',
        'Kurti',
        '=SUM(1,1)',
        'hidden',
        'KURTI-L',
        '700.00',
        '0',
        'L',
      ],
      ['Scarf', '450.00', null, null, 'active', null, null, null, null],
    ]);
  });

  it('writes CSV with a byte order mark and a quote before a formula', async () => {
    const file = await service([kurti, scarf]).export('store', { format: 'csv' }, actor);
    expect(file.type).toBe('text/csv; charset=utf-8');
    expect(file.body.toString().split('\r\n')).toEqual([
      `${String.fromCharCode(0xfeff)}"Name","Price","Category","Description","Status","SKU","Cost","On hand","Size"`,
      `"Cotton কুর্তি, premium","1200.00","Kurti","'=SUM(1,1)","hidden","KURTI-M","700.00","10","M"`,
      `"Cotton কুর্তি, premium","1250.50","Kurti","'=SUM(1,1)","hidden","KURTI-L","700.00","0","L"`,
      '"Scarf","450.00","","","active","","","",""',
      '',
    ]);
  });

  it('records who took the catalogue', async () => {
    const recorded: unknown[] = [];
    await service([kurti], recorded).export('store', { format: 'csv' }, actor);
    expect(recorded).toMatchObject([{ action: 'products.exported', after: { state: '2_rows' } }]);
  });
});
