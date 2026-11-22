import { describe, expect, it } from 'vitest';

import { AppError } from '../platform/errors/app-error';
import type { ProductsService } from '../products/products.service';
import { CardTapRepliesService } from './card-tap-replies.service';

const product = {
  id: 'p1',
  name: 'কটন পাঞ্জাবি',
  isStockTracked: true,
  variants: [
    { id: 'm', title: 'M', pricePoisha: 125000, available: 3 },
    { id: 'xxl', title: 'XXL', pricePoisha: 140000, available: 0 },
  ],
};

function replies(found: boolean) {
  const products = {
    getForChat: async () => {
      if (!found) throw new AppError('PRODUCT_NOT_FOUND', { status: 404, message: 'missing' });
      return product;
    },
  } as unknown as ProductsService;
  return new CardTapRepliesService(products);
}

describe('CardTapRepliesService', () => {
  it('lists every size and marks the sold-out one', async () => {
    const text = await replies(true).reply('s', { kind: 'sizes', productId: 'p1' });
    expect(text).toContain('M: ৳1,250');
    expect(text).toContain('XXL: ৳1,400 · স্টক নেই');
  });

  it('asks for the order details after a tap on an available size', async () => {
    const text = await replies(true).reply('s', { kind: 'order', productId: 'p1', variantId: 'm' });
    expect(text).toContain('কটন পাঞ্জাবি (M)');
    expect(text).toContain('মোবাইল নম্বর');
  });

  it('never takes an order for a sold-out size, only offers what is left', async () => {
    const text = await replies(true).reply('s', {
      kind: 'order',
      productId: 'p1',
      variantId: 'xxl',
    });
    expect(text).not.toContain('XXL');
    expect(text).toContain('M');
    expect(text).toContain('Which size?');
  });

  it('says the product is gone when it no longer exists', async () => {
    const text = await replies(false).reply('s', { kind: 'order', productId: 'p1' });
    expect(text).toContain('Sorry');
  });
});
