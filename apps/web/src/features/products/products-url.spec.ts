import { describe, expect, it } from 'vitest';

import { parseProductsScreen } from './products-url';

const cursor = '019c01ea-cf15-7d31-a7f5-d73d66007ae4';

describe('parseProductsScreen', () => {
  it('sorts by best selling when the address names no sort', () => {
    expect(parseProductsScreen({})?.query.sort).toBe('best_selling');
    expect(parseProductsScreen({ sort: 'newest' })?.query.sort).toBe('newest');
  });
  it('goes back to the first page when the cursor does not fit the sort', () => {
    expect(parseProductsScreen({ cursor })?.query.cursor).toBeUndefined();
    expect(parseProductsScreen({ sort: 'newest', cursor })?.query.cursor).toBe(cursor);
  });
  it('still refuses an address with other invalid values', () => {
    expect(parseProductsScreen({ readiness: 'unknown' })).toBeUndefined();
  });
});
