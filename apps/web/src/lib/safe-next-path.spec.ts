import { describe, expect, it } from 'vitest';

import { safeNextPath, signInPath } from './safe-next-path';

describe('safeNextPath', () => {
  it.each([
    ['/orders', '/orders'],
    ['/orders?status=pending&page=2', '/orders?status=pending&page=2'],
    ['/customers/abc#notes', '/customers/abc#notes'],
  ])('keeps the same-site path %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    'orders',
    '//evil.example',
    '/\\evil.example',
    'https://evil.example/orders',
    'javascript:alert(1)',
    '/orders\nSet-Cookie: x=1',
    '/sign-in',
    '/sign-in?next=/orders',
    '/sign-up/verify',
    `/${'a'.repeat(2000)}`,
  ])('rejects %j', (input) => {
    expect(safeNextPath(input)).toBeUndefined();
  });

  it('builds the sign-in path with an encoded next value, or none', () => {
    expect(signInPath('/orders?status=pending')).toBe('/sign-in?next=%2Forders%3Fstatus%3Dpending');
    expect(signInPath('//evil.example')).toBe('/sign-in');
  });
});
