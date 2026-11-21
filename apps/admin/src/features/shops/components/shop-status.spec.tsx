import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { adminShopStatuses } from '@dakly/contracts/admin-shops';

import { ShopStatus, statusLabel } from './shop-status';

describe('shop status badge', () => {
  it('says Trial for a trialing shop and plain words for the rest', () => {
    expect(statusLabel('trialing')).toBe('Trial');
    expect(statusLabel('past_due')).toBe('past due');
    expect(statusLabel('read_only')).toBe('read only');
  });

  it('renders every status', () => {
    for (const status of adminShopStatuses)
      expect(renderToStaticMarkup(<ShopStatus status={status} />)).toContain(statusLabel(status));
  });
});
