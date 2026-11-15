import { describe, expect, it } from 'vitest';

import { bdMobileSchema, maskPhone } from './phone';

describe('bdMobileSchema', () => {
  it.each([
    ['01712345678', '01712345678'],
    ['1712345678', '01712345678'],
    ['০১৭১২৩৪৫৬৭৮', '01712345678'],
    ['১৭১২৩৪৫৬৭৮', '01712345678'],
    ['+৮৮০১৭১২৩৪৫৬৭৮', '01712345678'],
    [' 017 1234 5678 ', '01712345678'],
    ['+8801712345678', '01712345678'],
    ['8801712345678', '01712345678'],
    ['017-1234-5678', '01712345678'],
  ])('normalises %s', (input, expected) => {
    const normalised = bdMobileSchema.parse(input);
    expect(normalised).toBe(expected);
    expect(bdMobileSchema.parse(normalised)).toBe(expected);
  });

  it.each(['0171234567', '017123456789', '01212345678', '1212345678', '০১২১২৩৪৫৬৭৮', 'abc'])(
    'rejects %s',
    (input) => {
      expect(bdMobileSchema.safeParse(input).success).toBe(false);
    },
  );
});

describe('maskPhone', () => {
  it('keeps the operator prefix and last three digits', () => {
    expect(maskPhone('01712345678')).toBe('01712-XXX678');
    expect(maskPhone('01987654321')).toBe('01987-XXX321');
  });
});
