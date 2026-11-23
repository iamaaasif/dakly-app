import { describe, expect, it } from 'vitest';

import type { ProductCategoryResponse } from '@dakly/contracts/product-lists';

import { categoryOptions } from './api/get-categories';
import { categoryIdForName } from './product-assistant-draft';

const category = (id: string, name: string, parentId: string | null = null) => ({
  id,
  name,
  parentId,
  sortOrder: 0,
  productCount: 0,
});
const categories: ProductCategoryResponse[] = [
  category('shoes', 'Shoes'),
  category('clothing', 'Clothing'),
  category('tshirts', 'T-shirts', 'clothing'),
];

describe('category choices', () => {
  it('lists each top-level category followed by the ones under it, as a path', () => {
    expect(categoryOptions(categories)).toEqual([
      { value: 'shoes', label: 'Shoes' },
      { value: 'clothing', label: 'Clothing' },
      { value: 'tshirts', label: 'Clothing > T-shirts' },
    ]);
  });

  it('picks the assistant draft category only when the shop has it, ignoring case', () => {
    expect(categoryIdForName(categories, ' clothing ')).toBe('clothing');
    expect(categoryIdForName(categories, 'Bags')).toBeUndefined();
  });
});
