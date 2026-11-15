import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { hashCode } from './code-hash';

describe('hashCode', () => {
  it('gives a different hash for the same code under another key', () => {
    const key = randomBytes(32).toString('base64');
    const otherKey = randomBytes(32).toString('base64');
    expect(hashCode(key, '123456')).toBe(hashCode(key, '123456'));
    expect(hashCode(key, '123456')).not.toBe(hashCode(otherKey, '123456'));
  });

  it('refuses to hash without a key', () => {
    expect(() => hashCode(undefined, '123456')).toThrow('Code hash key is required');
  });
});
