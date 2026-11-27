import { describe, expect, it } from 'vitest';

import { matchesAnyKeyword } from './message-keywords';

describe('matchesAnyKeyword', () => {
  it.each([
    ['দাম কত ভাই?', ['দাম'], true],
    ['দামটা কত', ['দাম'], true],
    ['dam koto?', ['dam'], true],
    ['Dam Koto', ['dam koto'], true],
    ['damta bolen', ['dam'], true],
    ['Adam er sathe kotha', ['dam'], false],
    ['price?', ['price', 'দাম'], true],
    ['pp', ['pp'], true],
    ['happy', ['pp'], false],
    ['এটার দাম koto, price bolen', ['dam', 'price'], true],
    ['size ১২ আছে?', ['size 12'], true],
    ['৪৫০ টাকা হবে?', ['450'], true],
    ['😍😍', ['price', 'দাম'], false],
    ['hello', [], false],
    ['hello', ['  '], false],
    ['1+1 offer', ['1+1'], true],
  ])('%s with %j is %s', (text, keywords, expected) => {
    expect(matchesAnyKeyword(text, keywords)).toBe(expected);
  });
});
