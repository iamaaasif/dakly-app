import { describe, expect, it } from 'vitest';

import { fitWithin } from './shrink-photo';

describe('fitWithin', () => {
  it('keeps a small photo as it is', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('shrinks the long edge to 2000 px and keeps the shape', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 1000, height: 2000 });
  });
});
