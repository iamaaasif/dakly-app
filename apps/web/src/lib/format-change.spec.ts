import { describe, expect, it } from 'vitest';

import { describeChange, formatChange } from './format-change';

describe('formatChange', () => {
  it('writes one decimal with a sign', () => {
    expect(formatChange(123n, 100n)).toBe('+23.0%');
    expect(formatChange(95n, 100n)).toBe('-5.0%');
    expect(formatChange(100n, 100n)).toBe('0.0%');
    expect(formatChange(5n, 0n)).toBe('New');
  });
});

describe('describeChange', () => {
  it('says Up or Down in whole percent', () => {
    expect(describeChange(123n, 100n)).toEqual({ variant: 'success', text: 'Up 23%' });
    expect(describeChange(95n, 100n)).toEqual({ variant: 'danger', text: 'Down 5%' });
    expect(describeChange(100n, 100n)).toEqual({ variant: 'neutral', text: 'No change' });
  });

  it('refuses to compare fewer than the minimum number of people', () => {
    expect(describeChange(19n, 40n, 20n).text).toBe('Too few to compare');
    expect(describeChange(40n, 19n, 20n).text).toBe('Too few to compare');
    expect(describeChange(40n, 20n, 20n).text).toBe('Up 100%');
  });
});
