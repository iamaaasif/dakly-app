import { describe, expect, it } from 'vitest';

import type { OrderCatalogueProduct } from '@dakly/contracts/orders';

import { AppError } from '../platform/errors/app-error';
import { OrderEntryService } from './order-entry.service';

const product = (id: string) => ({ id }) as OrderCatalogueProduct;

function serviceWith(getForOrder: (storeId: string, id: string) => Promise<OrderCatalogueProduct>) {
  const repository = { findRecentProductIds: () => Promise.resolve(['a', 'b', 'c']) };
  return new OrderEntryService(
    repository as never,
    {} as never,
    { getForOrder } as never,
    {} as never,
  );
}

describe('OrderEntryService.recentProducts', () => {
  it('skips a product that no longer exists', async () => {
    const service = serviceWith((_storeId, id) =>
      id === 'b'
        ? Promise.reject(new AppError('PRODUCT_NOT_FOUND', { status: 404, message: 'gone' }))
        : Promise.resolve(product(id)),
    );
    expect((await service.recentProducts('store')).map(({ id }) => id)).toEqual(['a', 'c']);
  });

  it('does not hide a database failure as an empty list', async () => {
    const service = serviceWith(() => Promise.reject(new Error('connection lost')));
    await expect(service.recentProducts('store')).rejects.toThrow('connection lost');
  });
});
