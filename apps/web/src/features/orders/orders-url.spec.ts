import { expect, it } from 'vitest';

import { ordersSearch } from './api/orders';
import { parseOrdersScreen } from './orders-url';

it('restores selected label IDs independently of order filters and the drawer', () => {
  const first = '018fffa0-1000-7000-8000-000000000001';
  const second = '018fffa0-1000-7000-8000-000000000002';
  const search = ordersSearch({
    stage: 'to_pack',
    cursor: 123,
    selected: second,
    labelOrderIds: [first, second],
  });
  expect(parseOrdersScreen(Object.fromEntries(new URLSearchParams(search)))).toEqual({
    query: { stage: 'to_pack', cursor: 123, limit: 50 },
    selected: second,
    labelOrderIds: [first, second],
  });
});
