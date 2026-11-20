import { describe, expect, it } from 'vitest';

import { returnPerTaka } from './campaign-results.service';

describe('return per ৳1', () => {
  it('is the poisha earned for each ৳1 spent', () => {
    expect(returnPerTaka(186_900n, 79_400n)).toBe('235');
  });

  it('is empty while nothing has been spent', () => {
    expect(returnPerTaka(186_900n, 0n)).toBeNull();
  });
});
