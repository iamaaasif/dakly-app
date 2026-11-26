import { describe, expect, it } from 'vitest';

import { pluralize } from './pluralize';

describe('pluralize', () => {
  it('adds an s except for one and groups large counts', () => {
    expect(pluralize(1, 'order')).toBe('1 order');
    expect(pluralize(0, 'order')).toBe('0 orders');
    expect(pluralize(128000, 'customer')).toBe('1,28,000 customers');
  });
});
