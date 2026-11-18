import { describe, expect, it } from 'vitest';

import { orderListQuerySchema, orderStageChangeSchema } from './orders';

describe('order list query', () => {
  it('takes a stage and an exclusive numeric cursor', () => {
    expect(orderListQuerySchema.parse({ stage: 'to_pack', cursor: '1003', limit: '10' })).toEqual({
      stage: 'to_pack',
      cursor: 1003,
      limit: 10,
    });
  });

  it.each([{ stage: 'inquiry' }, { cursor: '-1' }, { limit: '101' }, { storeId: 'other' }])(
    'rejects an unsupported filter %j',
    (query) => {
      expect(orderListQuerySchema.safeParse(query).success).toBe(false);
    },
  );
});

it('rejects a hold follow-up date in year zero', () => {
  expect(
    orderStageChangeSchema.safeParse({
      to: 'on_hold',
      reason: 'pre_order',
      followUpOn: '0000-01-01',
    }).success,
  ).toBe(false);
});
