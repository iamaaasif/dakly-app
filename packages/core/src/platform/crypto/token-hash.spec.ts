import { describe, expect, it } from 'vitest';

import { hashToken } from './token-hash';

describe('hashToken', () => {
  it('returns the SHA-256 digest of the token', () => {
    expect(hashToken('abc').toString('hex')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
