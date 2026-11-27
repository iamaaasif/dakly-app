// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ProductResponse, ProductVariantResponse } from '@dakly/contracts/products';

import { ProductChatPreview } from './product-chat-preview';

const variant = (title: string, available: number): ProductVariantResponse => ({
  id: `019c01ea-cf15-7d31-a7f5-d73d66007a${title.length}${available}`,
  imageFileIds: [],
  photos: [],
  title,
  optionValues: {},
  sku: null,
  lowStockThreshold: null,
  costPoisha: null,
  priceOverridePoisha: null,
  pricePoisha: 245000,
  isDefault: false,
  onHand: available,
  reserved: 0,
  available,
});

const product = (overrides: Partial<ProductResponse>): ProductResponse => ({
  version: 1,
  id: '019c01ea-cf15-7d31-a7f5-d73d66007ae2',
  name: 'Cotton Panjabi',
  description: null,
  categoryId: null,
  category: null,
  brandId: null,
  brand: null,
  weightGrams: null,
  aliases: [],
  pricePoisha: 245000,
  compareAtPricePoisha: null,
  negotiationEnabled: false,
  options: [],
  isStockTracked: true,
  stockStatus: 'in_stock',
  allowOrdersWhenOutOfStock: false,
  shortDescription: null,
  barcode: null,
  isVisibleInChats: true,
  isVisibleInOrderLink: true,
  status: 'active',
  imageFileIds: [],
  photos: [],
  readiness: [],
  variants: [variant('M', 4), variant('L', 0)],
  createdAt: '2026-11-17T08:00:00Z',
  updatedAt: '2026-11-17T08:00:00Z',
  ...overrides,
});

afterEach(cleanup);

describe('ProductChatPreview', () => {
  it('shows the card the AI sends, with the price of sizes in stock', () => {
    render(<ProductChatPreview product={product({})} />);
    expect(screen.getByText('Cotton Panjabi')).toBeTruthy();
    expect(screen.getByText('৳2,450')).toBeTruthy();
    expect(screen.getByText('Order now')).toBeTruthy();
    expect(screen.getByText('See sizes')).toBeTruthy();
  });

  it('never offers a product with every size sold out', () => {
    render(<ProductChatPreview product={product({ variants: [variant('M', 0)] })} />);
    expect(screen.getByText('স্টক নেই (out of stock)')).toBeTruthy();
    expect(screen.queryByText('Order now')).toBeNull();
  });
});
