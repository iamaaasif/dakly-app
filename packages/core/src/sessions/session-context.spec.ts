import { describe, it, expect } from 'vitest';
import type { StoreAccess } from '@dakly/contracts/team';
import { sessionContextTag } from './session-context';

describe('sessionContextTag', () => {
  const access: StoreAccess = {
    role: 'custom',
    areas: { customers: 'view', orders: 'edit' },
    seeFullPhone: false,
    exportLists: false,
    refund: false,
  };
  it('uses a canonical permission order and normalizes absent denied areas', () => {
    const reordered: StoreAccess = {
      ...access,
      areas: { orders: 'edit', customers: 'view', billing: 'none' },
    };
    expect(sessionContextTag('session', 'store', access)).toBe(
      sessionContextTag('session', 'store', reordered),
    );
  });
  it('changes with session, store, access level, or privacy grants', () => {
    const original = sessionContextTag('session', 'store', access);
    expect(
      new Set([
        original,
        sessionContextTag('other', 'store', access),
        sessionContextTag('session', 'other', access),
        sessionContextTag('session', 'store', { ...access, seeFullPhone: true }),
        sessionContextTag('session', 'store', { ...access, areas: { customers: 'edit' } }),
        sessionContextTag('session'),
      ]).size,
    ).toBe(6);
  });
});
