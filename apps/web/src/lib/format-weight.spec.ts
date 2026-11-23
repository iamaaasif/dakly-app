import { describe, expect, it } from 'vitest';

import { formatWeight } from './format-weight';

describe('formatWeight', () => {
  it('uses grams under a kilo', () => expect(formatWeight(450)).toBe('450 g'));
  it('uses kilos from a kilo up', () => {
    expect(formatWeight(1000)).toBe('1 kg');
    expect(formatWeight(1250)).toBe('1.25 kg');
  });
});
