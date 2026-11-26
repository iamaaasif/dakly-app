import { describe, expect, it } from 'vitest';

import { toAsciiDigits } from './digits';

describe('toAsciiDigits', () => {
  it('turns Bangla digits into ASCII and leaves other text alone', () => {
    expect(toAsciiDigits('জুতা ৪১, size 42, ০১৭১২')).toBe('জুতা 41, size 42, 01712');
  });
});
