import { describe, expect, it } from 'vitest';
import { bdMobileSchema } from './phone';

describe('bdMobileSchema', () => {
  it.each([
    ['01712345678', '01712345678'],
    ['+8801712345678', '01712345678'],
    ['8801712345678', '01712345678'],
    ['017-1234-5678', '01712345678'],
  ])('normalises %s', (input, expected) => {
    expect(bdMobileSchema.parse(input)).toBe(expected);
  });

  it.each(['0171234567', '01212345678', 'abc'])('rejects %s', (input) => {
    expect(bdMobileSchema.safeParse(input).success).toBe(false);
  });
});
