import { describe, expect, it } from 'vitest';

import { formatPhone } from './format-phone';

describe('formatPhone', () => {
  it.each([
    ['01712345678', '01712-345678'],
    ['01987654321', '01987-654321'],
    ['01712XXX678', '01712-XXX678'],
    ['017XXXXX678', '017XX-XXX678'],
    ['01712-XXX678', '01712-XXX678'],
    ['017XX-XXX678', '017XX-XXX678'],
  ])('groups the supplied display value %s as %s', (value, expected) => {
    expect(formatPhone(value)).toBe(expected);
  });

  it.each(['', '+8801712345678', '1712345678', '০১৭১২৩৪৫৬৭৮', '01712-34', 'unknown'])(
    'leaves unsupported display values unchanged without normalizing %s',
    (value) => {
      expect(formatPhone(value)).toBe(value);
    },
  );
});
