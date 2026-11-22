import { describe, expect, it } from 'vitest';

import { parseQuickAddHandoff, quickAddHandoffHref } from './quick-add-handoff';

describe('quick add handoff', () => {
  it('builds an address from the typed values and reads them back', () => {
    const href = quickAddHandoffHref({ name: 'Cotton Panjabi', price: '1250.50', stock: '6' });
    const params = Object.fromEntries(new URL(href, 'http://shop.test').searchParams);
    expect(parseQuickAddHandoff(params)).toEqual({
      name: 'Cotton Panjabi',
      price: '1250.50',
      stock: '6',
    });
  });

  it('opens the plain page when nothing was typed', () => {
    expect(quickAddHandoffHref({ name: '', price: '', stock: '' })).toBe('/products/new');
  });

  it('drops a price or stock that is not a number', () => {
    expect(parseQuickAddHandoff({ name: 'Shirt', price: '12abc', stock: ['-3'] })).toEqual({
      name: 'Shirt',
      price: '',
      stock: '',
    });
  });
});
