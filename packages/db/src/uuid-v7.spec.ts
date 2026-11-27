import { describe, expect, it } from 'vitest';

import { uuidv7 } from './uuid-v7';

describe('uuidv7', () => {
  it('returns a version 7 uuid with the RFC variant', () => {
    expect(uuidv7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('sorts ids made in later milliseconds after earlier ones', async () => {
    const first = uuidv7();
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = uuidv7();

    expect(first < second).toBe(true);
  });

  it('sorts ids made in the same millisecond in the order they were made', () => {
    const ids = Array.from({ length: 5000 }, () => uuidv7());

    expect([...ids].sort()).toEqual(ids);
  });
});
