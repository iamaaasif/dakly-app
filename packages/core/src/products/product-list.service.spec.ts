import { describe, expect, it } from 'vitest';

import type { ProductListQuery, ProductResponse } from '@dakly/contracts/products';

import type { OrderProductSalesService } from '../orders/order-product-sales.service';
import type { StoresService } from '../stores/stores.service';
import { ProductListService } from './product-list.service';
import type { ProductsRepository } from './products.repository';
import type { ProductsService } from './products.service';

const query: ProductListQuery = { limit: 50 };

function product(id: string, variantIds: string[]) {
  return { id, variants: variantIds.map((variantId) => ({ id: variantId })) } as ProductResponse;
}

function listService(
  items: ProductResponse[],
  toConfirm: { variantId: string; units: number }[],
  total = items.length,
) {
  const asked: string[][] = [];
  const service = new ProductListService(
    { list: async () => ({ items, nextCursor: 'next' }) } as unknown as ProductsService,
    { count: async () => total } as unknown as ProductsRepository,
    {
      unitsToConfirm: async (_storeId: string, variantIds: string[]) => {
        asked.push(variantIds);
        return toConfirm;
      },
    } as unknown as OrderProductSalesService,
    { settings: async () => ({ stock: { lowStockThreshold: 3 } }) } as unknown as StoresService,
  );
  return { service, asked };
}

describe('ProductListService', () => {
  it('adds the units waiting to confirm across all variants of each product', async () => {
    const { service } = listService(
      [product('p1', ['a', 'b']), product('p2', ['c']), product('p3', ['d'])],
      [
        { variantId: 'a', units: 2 },
        { variantId: 'b', units: 1 },
        { variantId: 'c', units: 4 },
      ],
    );

    const page = await service.list('store', query, false);

    expect(page.items.map(({ id, waitingToConfirmCount }) => [id, waitingToConfirmCount])).toEqual([
      ['p1', 3],
      ['p2', 4],
      ['p3', 0],
    ]);
  });

  it('asks only about the variants on this page and keeps the cursor', async () => {
    const { service, asked } = listService([product('p1', ['a', 'b'])], []);

    const page = await service.list('store', query, false);

    expect(asked).toEqual([['a', 'b']]);
    expect(page.nextCursor).toBe('next');
  });

  it('returns the total of all matches, not just this page', async () => {
    const { service } = listService([product('p1', ['a'])], [], 2486);

    expect((await service.list('store', query, false)).totalCount).toBe(2486);
  });
});
