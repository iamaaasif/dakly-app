import { describe, expect, it } from 'vitest';

import { countSmsParts } from './sms';

describe('countSmsParts', () => {
  it.each([
    ['160 English characters', 'a'.repeat(160), 1],
    ['161 English characters', 'a'.repeat(161), 2],
    ['306 English characters', 'a'.repeat(306), 2],
    ['307 English characters', 'a'.repeat(307), 3],
    ['80 braces, two septets each', '{'.repeat(80), 1],
    ['81 braces, two septets each', '{'.repeat(81), 2],
    ['70 Bangla characters', 'অ'.repeat(70), 1],
    ['71 Bangla characters', 'অ'.repeat(71), 2],
    ['134 Bangla characters', 'অ'.repeat(134), 2],
    ['135 Bangla characters', 'অ'.repeat(135), 3],
    ['100 English characters and one Bangla', `${'a'.repeat(100)}অ`, 2],
  ])('counts %s', (_, text, parts) => {
    expect(countSmsParts(text)).toBe(parts);
  });
});
