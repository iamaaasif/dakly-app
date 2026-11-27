import { expect, it } from 'vitest';

import type { OrderListQuery } from '@dakly/contracts/orders';

import { ordersSearch } from './api/orders';
import { currentOrderTab, orderTabQuery, parseOrdersScreen } from './orders-url';

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

const parse = (search: string) =>
  parseOrdersScreen(Object.fromEntries(new URLSearchParams(search)));

it('opens To confirm unless the address picks another view', () => {
  expect(parse('')?.query.stage).toBe('to_confirm');
  expect(parse('tab=inquiries')?.query.stage).toBeUndefined();
  expect(parse('paymentStatus=advance_requested')?.query.stage).toBeUndefined();
  expect(parse('alert=risk')?.query.stage).toBeUndefined();
});

it('names the tab the address shows, and none for views outside the tabs', () => {
  const tab = (search: string) => {
    const screen = parse(search);
    return screen && currentOrderTab({ ...screen.query, tab: screen.tab });
  };
  expect(tab('tab=inquiries')).toBe('inquiries');
  expect(tab('paymentStatus=advance_requested')).toBe('pending');
  expect(tab('stage=on_hold')).toBe('on_hold');
  expect(tab('stage=cancelled')).toBeUndefined();
  expect(tab('alert=waiting')).toBeUndefined();
});

it('keeps the search and filters when moving to another tab, and drops the page', () => {
  const from = { limit: 50, stage: 'delivered', cursor: 80, search: 'Rahim', courier: 'pathao' };
  expect(orderTabQuery('pending', from as OrderListQuery)).toEqual({
    limit: 50,
    search: 'Rahim',
    courier: 'pathao',
    paymentStatus: 'advance_requested',
  });
  expect(orderTabQuery('inquiries', from as OrderListQuery)).toEqual({
    limit: 50,
    search: 'Rahim',
    tab: 'inquiries',
  });
});
